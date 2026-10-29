import { firstTime } from '../ui/once';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { DAY_LETTERS } from '../config/goals';
import { sourceLabel } from '../config/sources';
import { setupHealthConnect } from '../health/permissions';
import { loadProfile } from '../profile/profile';
import {
  atReserve,
  avgHr,
  goalLine,
  HrBounds,
  kmMarks,
  kmText,
  maxHr,
  minutesOf,
  nextTarget,
  paceBands,
  paceOf,
  paceText,
  Reply,
  RoutePt,
  Run,
  RunGoal,
  RunPrefs,
  smooth,
  splits,
  talk,
  targetText,
  zones,
} from '../run/analyze';
import { askRoute, bounds, loadRunSkips, RunSkip, syncRuns, typeName } from '../run/read';
import { loadRunPrefs, loadRuns, saveRunPrefs, setReply } from '../run/store';
import { PrimaryButton } from '../ui/components';
import { Choice } from '../ui/inputs';
import { Sheet } from '../ui/Sheet';
import { C, T } from '../ui/theme';

import { END, ROW, START } from '../i18n';
const ORANGE = C.signal;
const when = (t: number) => {
  const d = new Date(t);
  const today = new Date().setHours(0, 0, 0, 0);
  const day = new Date(t).setHours(0, 0, 0, 0);
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (day === today) return `היום ${time}`;
  if (day === today - 86400000) return `אתמול ${time}`;
  return `${d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })} ${time}`;
};

// ---------- the map ----------

/**
 * The track on a dark map tile: smoothed, with a soft glow under it and a faint grid behind.
 * Full size: colored by pace (orange fastest, gray slowest) with a marker at every km.
 * Thumbnail: one orange line.
 */
export function RouteMap({ route, width, height, thin = false }: { route: RoutePt[]; width: number; height: number; thin?: boolean }) {
  const shape = useMemo(() => {
    const sm = smooth(route);
    const lat0 = (sm[0].lat * Math.PI) / 180;
    const xs = sm.map((p) => p.lon * Math.cos(lat0));
    const ys = sm.map((p) => -p.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = thin ? 14 : 28;
    const k = Math.min((width - 2 * pad) / (maxX - minX || 1e-9), (height - 2 * pad) / (maxY - minY || 1e-9));
    const ox = (width - (maxX - minX) * k) / 2;
    const oy = (height - (maxY - minY) * k) / 2;
    const pts = xs.map((x, i) => [ox + (x - minX) * k, oy + (ys[i] - minY) * k]);
    const toLine = (from: number, to: number) => pts.slice(from, to + 1).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    return {
      pts,
      line: toLine(0, pts.length - 1),
      bands: thin ? [] : paceBands(sm).map((b) => ({ color: b.band === 'fast' ? ORANGE : b.band === 'slow' ? '#7A756E' : '#F2EFEA', line: toLine(b.from, b.to) })),
      marks: thin ? [] : kmMarks(sm),
    };
  }, [route, width, height, thin]);
  const { pts, line, bands, marks } = shape;
  const sw = thin ? 2.5 : 4.5;
  const grid = thin ? 16 : 28;
  const end = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      {Array.from({ length: Math.floor(width / grid) }, (_, i) => (
        <Line key={`v${i}`} x1={(i + 1) * grid} x2={(i + 1) * grid} y1={0} y2={height} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={1} />
      ))}
      {Array.from({ length: Math.floor(height / grid) }, (_, i) => (
        <Line key={`h${i}`} y1={(i + 1) * grid} y2={(i + 1) * grid} x1={0} x2={width} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={1} />
      ))}
      {/* Glow */}
      <Polyline points={line} fill="none" stroke={ORANGE} strokeOpacity={0.18} strokeWidth={sw * 3.2} strokeLinejoin="round" strokeLinecap="round" />
      {thin ? (
        <Polyline points={line} fill="none" stroke={ORANGE} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
      ) : (
        <>
          <Polyline points={line} fill="none" stroke="#000000" strokeOpacity={0.6} strokeWidth={sw + 2} strokeLinejoin="round" strokeLinecap="round" />
          {bands.map((b, i) => (
            <Polyline key={i} points={b.line} fill="none" stroke={b.color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {marks.map((idx, i) => (
            <G key={`m${i}`}>
              <Circle cx={pts[idx][0]} cy={pts[idx][1]} r={9} fill="#111111" stroke="#F2EFEA" strokeWidth={1.5} />
              <SvgText x={pts[idx][0]} y={pts[idx][1] + 3.5} fontSize={10} fontWeight="bold" fill="#F2EFEA" textAnchor="middle">
                {i + 1}
              </SvgText>
            </G>
          ))}
        </>
      )}
      <Circle cx={end[0]} cy={end[1]} r={thin ? 3.5 : 6} fill={ORANGE} stroke="#111111" strokeWidth={2} />
      <Circle cx={pts[0][0]} cy={pts[0][1]} r={thin ? 3.5 : 6} fill="#FFFFFF" stroke="#111111" strokeWidth={2} />
    </Svg>
  );
}

function HrLine({ run, b, width }: { run: Run; b: HrBounds; width: number }) {
  const h = 70;
  if (run.hr.length < 10) return null;
  const lo = Math.min(...run.hr.map((x) => x.bpm), b.rest + 20);
  const hi = Math.max(...run.hr.map((x) => x.bpm), atReserve(b, 0.85));
  const x = (t: number) => ((t - run.start) / (run.end - run.start)) * width;
  const y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * h;
  const easy = atReserve(b, 0.7);
  return (
    <Svg width={width} height={h}>
      <Line x1={0} x2={width} y1={y(easy)} y2={y(easy)} stroke={C.muted} strokeDasharray="4 4" strokeWidth={1} />
      <Polyline points={run.hr.map((p) => `${width - x(p.t)},${y(p.bpm)}`).join(' ')} fill="none" stroke={ORANGE} strokeWidth={2} />
    </Svg>
  );
}

const ZONE_NAMES = ['קל', 'אירובי', 'יציב', 'קשה', 'מקסימלי'];
const ZONE_COLORS = ['#D9D5CF', '#B8B2A9', '#8C8780', '#E5401F', '#A3290F'];

function Zones({ run, b }: { run: Run; b: HrBounds }) {
  const z = zones(run.hr, b);
  if (run.hr.length < 10) return null;
  return (
    <View style={{ gap: 6 }}>
      <View style={s.zbar}>
        {z.map((f, i) => (f > 0 ? <View key={i} style={{ flex: f, backgroundColor: ZONE_COLORS[i] }} /> : null))}
      </View>
      <View style={s.legend}>
        {z.map((f, i) =>
          f >= 0.01 ? (
            <View key={i} style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: ZONE_COLORS[i] }]} />
              <Text style={[T.muted, { fontSize: 12 }]}>
                {ZONE_NAMES[i]} {Math.round(f * 100)}%
              </Text>
            </View>
          ) : null,
        )}
      </View>
      <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>
        הטווחים לפי דופק מקסימלי {b.max} ({b.maxFrom === 'age' ? 'הערכה לפי גיל' : 'הגבוה שהגעת אליו'}) ודופק מנוחה {b.rest} ({b.restFrom === 'night' ? 'מהלילה' : 'הערכה, השעון לא מעביר'}). זו הערכה, לא בדיקת מאמץ.
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[T.bold, { fontSize: 22, textAlign: 'center' }]}>{value}</Text>
      <Text style={[T.muted, { fontSize: 12, textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

// ---------- one run ----------

function RunDetail({ run, runs, prefs, b, onChanged }: { run: Run; runs: Run[]; prefs: RunPrefs; b: HrBounds; onChanged: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - 40;
  const [asking, setAsking] = useState<string | null>(null);
  const t = talk(run, runs.filter((r) => r.start < run.start), prefs, b, Date.now());
  const sp = splits(run.route);
  const answer = run.reply ? t.answers.find((a) => a.key === run.reply) : undefined;

  return (
    <View style={{ gap: 16 }}>
      <Text style={[T.muted, { fontSize: 13 }]}>
        {when(run.start)} · {sourceLabel(run.source)}
        {run.treadmill ? ' · הליכון' : ''}
      </Text>
      {run.route?.length ? (
        <View style={s.mapCard}>
          <RouteMap route={run.route} width={w} height={Math.round(w * 0.8)} />
          <View style={[s.legend, { paddingHorizontal: 14, paddingBottom: 12 }]}>
            <View style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: ORANGE }]} />
              <Text style={{ color: '#CFCAC2', fontSize: 12 }}>מהיר</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: '#fff' }]} />
              <Text style={{ color: '#CFCAC2', fontSize: 12 }}>בינוני</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: '#6E6A63' }]} />
              <Text style={{ color: '#CFCAC2', fontSize: 12 }}>איטי</Text>
            </View>
            <Text style={{ color: '#8C8780', fontSize: 12 }}>לבן: התחלה · מספר: כל ק"מ</Text>
          </View>
        </View>
      ) : run.routeState === 'CONSENT' ? (
        <View style={{ gap: 6 }}>
          <PrimaryButton
            label="הצג מסלול"
            onPress={async () => {
              setAsking('מחכה לאישור של Android...');
              const res = await askRoute(run.id);
              setAsking('error' in res ? `לא התקבל מסלול: ${res.error}` : null);
              onChanged();
            }}
          />
          <Text style={[T.muted, { fontSize: 12, lineHeight: 18 }]}>{asking ?? 'בחלון של Android, "מתן הרשאה לכל המסלולים" חוסך את האישור בכל ריצה.'}</Text>
        </View>
      ) : (
        <Text style={[T.muted, { fontSize: 13 }]}>{run.treadmill ? 'ריצה על הליכון, אין מסלול.' : 'השעון לא העביר מסלול לריצה הזו.'}</Text>
      )}

      <View style={{ flexDirection: ROW }}>
        <Stat value={kmText(run.km)} label='ק"מ' />
        <Stat value={paceText(minutesOf(run) * 60)} label="זמן" />
        <Stat value={paceText(paceOf(run))} label='קצב לק"מ' />
        {avgHr(run) ? <Stat value={String(avgHr(run))} label={`דופק (מקס ${maxHr(run)})`} /> : null}
      </View>

      <View style={[s.talk, (t.title.includes('הערה')) && { borderColor: ORANGE }]}>
        <Text style={[T.bold, { fontSize: 15 }]}>המאמן</Text>
        <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{t.body}</Text>
        {answer ? (
          <View style={{ gap: 6 }}>
            <Text style={[T.bold, { fontSize: 13 }]}>ענית: {answer.label}</Text>
            <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{answer.reply}</Text>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          {t.answers.map((a) => (
            <Pressable
              key={a.key}
              onPress={async () => {
                await setReply(run.id, a.key as Reply);
                onChanged();
              }}
              style={({ pressed }) => [s.answer, run.reply === a.key && s.answerOn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[T.bold, { fontSize: 14, textAlign: 'center', color: run.reply === a.key ? '#fff' : C.ink }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {sp.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={[T.bold, { fontSize: 15 }]}>קילומטר אחרי קילומטר</Text>
          {sp.map((sec, i) => {
            const best = Math.min(...sp);
            const worst = Math.max(...sp);
            return (
              <View key={i} style={s.split}>
                <Text style={[T.muted, { fontSize: 13, width: 40 }]}>ק"מ {i + 1}</Text>
                <View style={{ flex: 1, height: 8, backgroundColor: C.track, borderRadius: 4, overflow: 'hidden', flexDirection: ROW }}>
                  <View style={{ width: `${40 + 60 * ((worst - sec) / (worst - best || 1))}%`, backgroundColor: sec === best ? ORANGE : C.data }} />
                </View>
                <Text style={[T.bold, { fontSize: 13, width: 44, textAlign: END }]}>{paceText(sec)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {run.hr.length >= 10 && (
        <View style={{ gap: 6 }}>
          <Text style={[T.bold, { fontSize: 15 }]}>דופק לאורך הריצה</Text>
          <HrLine run={run} b={b} width={w} />
          <Text style={[T.muted, { fontSize: 12 }]}>הקו המקווקו: {atReserve(b, 0.7)}, הגבול של ריצה קלה.</Text>
          <Zones run={run} b={b} />
        </View>
      )}
    </View>
  );
}

// ---------- settings ----------

function RunSettings({ prefs, onSave }: { prefs: RunPrefs; onSave: (p: RunPrefs) => void }) {
  const [days, setDays] = useState(prefs.days);
  const [kind, setKind] = useState<RunGoal['kind'] | 'none'>(prefs.goal?.kind ?? 'none');
  const [km, setKm] = useState(prefs.goal && prefs.goal.kind !== 'habit' ? prefs.goal.km : 5);
  const [minutes, setMinutes] = useState(prefs.goal?.kind === 'time' ? prefs.goal.minutes : 30);
  const [perWeek, setPerWeek] = useState(prefs.goal?.kind === 'habit' ? prefs.goal.perWeek : 3);
  const step = (label: string, value: string, dec: () => void, inc: () => void) => (
    <View style={s.stepRow}>
      <Text style={[T.bold, { fontSize: 15, flex: 1 }]}>{label}</Text>
      <Pressable onPress={dec} style={s.stepBtn} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>−</Text>
      </Pressable>
      <Text style={[T.bold, { fontSize: 15, width: 70, textAlign: 'center' }]}>{value}</Text>
      <Pressable onPress={inc} style={s.stepBtn} hitSlop={6}>
        <Text style={[T.bold, { fontSize: 18, textAlign: 'center' }]}>+</Text>
      </Pressable>
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      <Text style={[T.bold, { fontSize: 15 }]}>ימי ריצה</Text>
      <View style={s.days}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const on = days.includes(d);
          return (
            <Pressable key={d} onPress={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())} style={[s.day, on && s.dayOn]}>
              <Text style={[T.bold, { textAlign: 'center', color: on ? '#fff' : C.ink }]}>{DAY_LETTERS[d]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[T.bold, { fontSize: 15 }]}>היעד</Text>
      <Choice
        options={[
          { key: 'distance', label: 'מרחק ברצף' },
          { key: 'time', label: 'מרחק בזמן' },
          { key: 'habit', label: 'התמדה' },
          { key: 'none', label: 'בלי יעד' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {(kind === 'distance' || kind === 'time') &&
        step('מרחק', `${km} ק"מ`, () => setKm(Math.max(1, km - 1)), () => setKm(Math.min(42, km + 1)))}
      {kind === 'time' && step('בתוך', `${minutes} דק'`, () => setMinutes(Math.max(5, minutes - 1)), () => setMinutes(Math.min(300, minutes + 1)))}
      {kind === 'time' && <Text style={[T.muted, { fontSize: 13 }]}>קצב יעד {paceText((minutes * 60) / km)} לק"מ</Text>}
      {kind === 'habit' && step('ריצות בשבוע', String(perWeek), () => setPerWeek(Math.max(1, perWeek - 1)), () => setPerWeek(Math.min(7, perWeek + 1)))}
      <PrimaryButton
        label="שמור"
        onPress={() =>
          onSave({
            ...prefs,
            days,
            goal: kind === 'none' ? undefined : kind === 'distance' ? { kind, km } : kind === 'time' ? { kind, km, minutes } : { kind, perWeek },
          })
        }
      />
    </View>
  );
}

// ---------- the card on the Train screen ----------

interface Loaded {
  runs: Run[];
  prefs: RunPrefs;
  b: HrBounds;
}

/** The running card: last run with its track, the goal, the next run. Opens the run in depth. */
export function RunCard({ openTick = 0 }: { openTick?: number }) {
  const [d, setD] = useState<Loaded | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const load = useCallback(async (sync: boolean) => {
    const profile = await loadProfile().catch(() => null);
    const age = profile?.age ?? 0;
    let runs = await loadRuns();
    if (sync) {
      try {
        if ((await setupHealthConnect()).ok) runs = await syncRuns(age);
      } catch {
        // keep the stored runs
      }
    }
    const prefs = await loadRunPrefs();
    setD({ runs, prefs, b: await bounds(age, runs) });
    setSkips(await loadRunSkips());
  }, []);
  const [skips, setSkips] = useState<RunSkip[]>([]);

  useEffect(() => {
    load(false).then(() => load(true));
  }, [load]);
  useEffect(() => {
    if (!openTick || !d?.runs.length || !firstTime('run', openTick)) return;
    setShown(d.runs[d.runs.length - 1].id);
  }, [openTick, d?.runs.length]);

  if (!d) return null;
  const { runs, prefs, b } = d;
  const last = runs[runs.length - 1];
  const now = Date.now();
  const next = nextTarget(runs, prefs, b, now);
  const goal = goalLine(runs, prefs, now);
  const run = shown ? runs.find((r) => r.id === shown) : undefined;

  return (
    <>
      <Pressable onPress={() => (last ? setShown(last.id) : setSettings(true))} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
        <View style={{ flexDirection: ROW, gap: 14, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: '#CFCAC2', fontSize: 13, textAlign: START }}>ריצה{last ? ` · ${when(last.start)}` : ''}</Text>
            {last ? (
              <Text style={{ color: '#fff', fontSize: 22, textAlign: START, fontFamily: T.bold.fontFamily }}>
                {kmText(last.km)} ק"מ · {paceText(paceOf(last))}
              </Text>
            ) : (
              <Text style={{ color: '#fff', fontSize: 18, textAlign: START, fontFamily: T.bold.fontFamily }}>עוד לא הגיעה ריצה</Text>
            )}
            {last && (last.steps || last.kcal || avgHr(last)) ? (
              <Text style={{ color: '#CFCAC2', fontSize: 13, textAlign: START }}>
                {[avgHr(last) ? `דופק ${avgHr(last)}` : null, last.kcal ? `${last.kcal} קלוריות` : null, last.steps ? `${last.steps.toLocaleString('he-IL')} צעדים` : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text style={{ color: '#CFCAC2', fontSize: 13, textAlign: START }}>
              הבאה: {targetText(next.km)} ק"מ{prefs.days.length ? ` · ${prefs.days.map((x) => DAY_LETTERS[x]).join(' ')}` : ''}
            </Text>
            {goal && <Text style={{ color: '#CFCAC2', fontSize: 12, textAlign: START }}>{goal}</Text>}
            {/* A newer session that did not become a run says why, instead of the run just missing */}
            {skips
              .filter((k) => !last || k.start > last.start)
              .slice(-1)
              .map((k) => (
                <Text key={k.id} style={{ color: '#E9B872', fontSize: 12, lineHeight: 18, textAlign: START }}>
                  {k.why === 'no_distance'
                    ? `ריצה מ${when(k.start)} הגיעה בלי מרחק. היא תופיע כשאפליקציית השעון תשלח את המרחק ל Health Connect.`
                    : `אימון מ${when(k.start)} (${typeName(k.type)}, ${k.km.toFixed(2)} ק"מ) לא זוהה כריצה: הקצב לא של ריצה.`}
                </Text>
              ))}
          </View>
          {last?.route?.length ? (
            <View style={s.tile}>
              <RouteMap route={last.route} width={96} height={96} thin />
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: ROW, gap: 16, paddingTop: 6 }}>
          {runs.length > 1 && (
            <Pressable onPress={() => setListOpen(true)} hitSlop={8}>
              <Text style={{ color: '#fff', fontSize: 13, textDecorationLine: 'underline', fontFamily: T.bold.fontFamily }}>כל הריצות</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setSettings(true)} hitSlop={8}>
            <Text style={{ color: '#fff', fontSize: 13, textDecorationLine: 'underline', fontFamily: T.bold.fontFamily }}>ימים ויעד</Text>
          </Pressable>
        </View>
      </Pressable>

      <Sheet open={!!run} onClose={() => setShown(null)} title={run ? `${kmText(run.km)} ק"מ` : ''}>
        {run ? <RunDetail run={run} runs={runs} prefs={prefs} b={b} onChanged={() => load(false)} /> : <ActivityIndicator color={C.ink} />}
      </Sheet>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="כל הריצות">
        {[...runs].reverse().map((r) => (
          <Pressable
            key={r.id}
            onPress={() => {
              setListOpen(false);
              setTimeout(() => setShown(r.id), 350);
            }}
            style={s.listRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={[T.bold, { fontSize: 14 }]}>
                {kmText(r.km)} ק"מ · {paceText(paceOf(r))} לק"מ
              </Text>
              <Text style={[T.muted, { fontSize: 12 }]}>
                {when(r.start)}
                {avgHr(r) ? ` · דופק ${avgHr(r)}` : ''}
              </Text>
            </View>
            {r.route?.length ? (
              <View style={[s.tile, { borderRadius: 10 }]}>
                <RouteMap route={r.route} width={52} height={52} thin />
              </View>
            ) : null}
          </Pressable>
        ))}
      </Sheet>

      <Sheet open={settings} onClose={() => setSettings(false)} title="ריצה: ימים ויעד">
        {settings && (
          <RunSettings
            prefs={prefs}
            onSave={async (p) => {
              await saveRunPrefs(p);
              setSettings(false);
              load(false);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.ink, borderRadius: 28, padding: 18, gap: 4 },
  mapCard: { backgroundColor: '#161514', borderRadius: 18, overflow: 'hidden' },
  tile: { backgroundColor: '#1F1E1C', borderRadius: 14, overflow: 'hidden' },
  legend: { flexDirection: ROW, flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: ROW, alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  zbar: { flexDirection: ROW, height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.track },
  talk: { gap: 10, borderWidth: 1, borderColor: C.track, borderRadius: 16, padding: 14 },
  answer: { borderWidth: 1, borderColor: C.ink, borderRadius: 12, paddingVertical: 11 },
  answerOn: { backgroundColor: C.ink },
  split: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  stepRow: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  stepBtn: { width: 40, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.track, justifyContent: 'center' },
  days: { flexDirection: ROW, gap: 6, justifyContent: 'space-between' },
  day: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.track, justifyContent: 'center' },
  dayOn: { backgroundColor: C.ink, borderColor: C.ink },
  listRow: { flexDirection: ROW, alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
});
