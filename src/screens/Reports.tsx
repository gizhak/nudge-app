import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DAY_NAMES, pad2 } from '../config/goals';
import { Metric, Progress, Report, Status, Verdict, VERDICT_LABEL } from '../report/compute';
import { ReportPrefs } from '../report/store';
import { Bar, Card } from '../ui/components';
import { Sheet } from '../ui/Sheet';
import { C, fmt, T } from '../ui/theme';

import { CHEVRON_BACK, CHEVRON_ON, ROW, t as tr } from '../i18n';
const dm = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};
const period = (r: Report) => tr(`${dm(r.start)} עד ${dm(r.end - 1)}`, `${dm(r.start)} to ${dm(r.end - 1)}`);
const kindName = (r: Report) => (r.kind === 'week' ? tr('שבועי', 'weekly') : tr('חודשי', 'monthly'));

const VERDICT_COLOR: Record<Verdict, string> = { on_track: C.ink, stuck: C.warn, drifting: C.bad, water: C.ink, too_fast: C.warn, unknown: C.muted };
const STATUS: Record<Status, { label: string; color: string }> = {
  good: { label: tr('ביעד', 'On target'), color: C.ink },
  ok: { label: tr('כמעט', 'Close'), color: C.warn },
  bad: { label: tr('רחוק', 'Far'), color: C.bad },
  none: { label: tr('אין נתונים', 'No data'), color: C.muted },
};

function Chip({ text, color }: { text: string; color: string }) {
  return <Text style={[T.bold, s.chip, { color, borderColor: color }]}>{text}</Text>;
}

function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={s.line}>
      <View style={s.lineTop}>
        <Text style={[T.base, { fontSize: 14, flex: 1 }]}>{label}</Text>
        <Text style={[T.bold, { fontSize: 14 }]}>{value}</Text>
      </View>
      {note ? <Text style={[T.muted, { fontSize: 12 }]}>{note}</Text> : null}
    </View>
  );
}

function MetricRow({ m }: { m: Metric }) {
  const st = STATUS[m.status];
  return (
    <View style={s.line}>
      <View style={s.lineTop}>
        <Text style={[T.bold, { fontSize: 15, flex: 1 }]}>{m.title}</Text>
        <Chip text={st.label} color={st.color} />
      </View>
      <Text style={[T.base, { fontSize: 14 }]}>{m.value}</Text>
      <Text style={[T.muted, { fontSize: 12 }]}>
        {m.detail}
        {m.trend ? ` · ${m.trend}` : ''}
      </Text>
    </View>
  );
}

const diffText = (a?: number, b?: number, unit = '', digits = 1) =>
  a != null && b != null ? tr(` (${a - b > 0 ? '+' : a - b < 0 ? '−' : ''}${fmt(Math.abs(a - b), digits)}${unit} מהקודם)`, ` (${a - b > 0 ? '+' : a - b < 0 ? '−' : ''}${fmt(Math.abs(a - b), digits)}${unit} vs last)`) : '';

/** The report itself: verdict, body, what drove it, patterns, forecast and one action. */
export function ReportView({ r }: { r: Report }) {
  const b = r.body;
  const next = r.kind === 'week' ? tr('לשבוע הקרוב', 'For the coming week') : tr('לחודש הקרוב', 'For the coming month');
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <View style={s.lineTop}>
          <Chip text={VERDICT_LABEL[r.verdict]} color={VERDICT_COLOR[r.verdict]} />
          <View style={{ flex: 1 }} />
        </View>
        <Text style={[T.bold, { fontSize: 18, lineHeight: 26 }]}>{r.headline}</Text>
        {r.sub ? <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{r.sub}</Text> : null}
        <Text style={[T.muted, { fontSize: 12, color: r.completeness.logged < r.completeness.days * 0.5 ? C.warn : C.muted }]}>{r.completeness.text}</Text>
      </View>

      <View style={s.action}>
        <Text style={[T.bold, { fontSize: 13, color: '#BDB8B0' }]}>{tr('הפעולה', 'The action')} {next}</Text>
        <Text style={[T.bold, { fontSize: 15, lineHeight: 22, color: '#fff' }]}>{r.action}</Text>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[T.bold, s.h]}>{tr('גוף', 'Body')}</Text>
        {b.weightAvg != null ? (
          <Line label={tr("משקל, ממוצע", 'Weight, average')} value={tr(`${fmt(b.weightAvg, 1)} ק"ג`, `${fmt(b.weightAvg, 1)} kg`)} note={tr(`${b.weighDays} שקילות${diffText(b.weightAvg, b.weightPrevAvg, ' ק"ג')}${b.rate != null && r.kind === 'month' ? ` · קצב ${b.rate < 0 ? '−' : '+'}${fmt(Math.abs(b.rate), 2)} ק"ג בשבוע` : ''}`, `${b.weighDays} weigh-ins${diffText(b.weightAvg, b.weightPrevAvg, ' kg')}${b.rate != null && r.kind === 'month' ? ` · pace ${b.rate < 0 ? '−' : '+'}${fmt(Math.abs(b.rate), 2)} kg a week` : ''}`)} />
        ) : (
          <Line label={tr("משקל", 'Weight')} value={tr("פחות מ 2 שקילות", 'Fewer than 2 weigh-ins')} />
        )}
        {b.fatAvg != null && <Line label={tr("אחוז שומן, מהמשקל החכם", 'Body fat, from the smart scale')} value={`${fmt(b.fatAvg, 1)}%`} note={tr(`הערכה, רגישה למים. חשובה המגמה${diffText(b.fatAvg, b.fatPrevAvg, '')}`, `An estimate, sensitive to water. The trend is what matters${diffText(b.fatAvg, b.fatPrevAvg, '')}`)} />}
        {b.leanAvg != null && <Line label={tr("מסה רזה", 'Lean mass')} value={tr(`${fmt(b.leanAvg, 1)} ק"ג`, `${fmt(b.leanAvg, 1)} kg`)} note={tr(`שריר, עצם ומים${diffText(b.leanAvg, b.leanPrevAvg, ' ק"ג')}`, `Muscle, bone and water${diffText(b.leanAvg, b.leanPrevAvg, ' kg')}`)} />}
        {b.waistCm != null && (
          <Line
            label={tr("היקף מותן", 'Waist')}
            value={tr(`${fmt(b.waistCm, 1)} ס"מ`, `${fmt(b.waistCm, 1)} cm`)}
            note={tr(`${b.waistDaysAgo === 0 ? 'נמדד היום' : `נמדד לפני ${b.waistDaysAgo} ימים`}${b.waistChange != null ? ` · ${b.waistChange > 0 ? '+' : b.waistChange < 0 ? '−' : ''}${fmt(Math.abs(b.waistChange), 1)} ס"מ מהמדידה הקודמת` : ''}`, `${b.waistDaysAgo === 0 ? 'Measured today' : `Measured ${b.waistDaysAgo} days ago`}${b.waistChange != null ? ` · ${b.waistChange > 0 ? '+' : b.waistChange < 0 ? '−' : ''}${fmt(Math.abs(b.waistChange), 1)} cm since the last measurement` : ''}`)}
          />
        )}
        {b.tape?.map((t) => (
          <Line key={t.title} label={tr(`היקף ${t.title}`, `${t.title}`)} value={tr(`${fmt(t.cm, 1)} ס"מ`, `${fmt(t.cm, 1)} cm`)} note={t.change != null ? tr(`${t.change > 0 ? '+' : t.change < 0 ? '−' : ''}${fmt(Math.abs(t.change), 1)} ס"מ מהמדידה הקודמת`, `${t.change > 0 ? '+' : t.change < 0 ? '−' : ''}${fmt(Math.abs(t.change), 1)} cm since the last measurement`) : undefined} />
        ))}
        {b.muscle ? <Text style={[T.bold, { fontSize: 14, lineHeight: 21, paddingVertical: 6 }]}>{b.muscle}</Text> : null}
        {b.whtr != null && <Line label={tr("יחס מותן לגובה", 'Waist to height ratio')} value={fmt(b.whtr, 2)} note={b.whtr < 0.5 ? tr('תקין: מתחת ל 0.5', 'Healthy: under 0.5') : tr('היעד: מתחת ל 0.5. זה המדד הכי פשוט לשומן בטני.', 'The goal: under 0.5. The simplest measure of belly fat.')} />}
        {b.navyFat != null && <Line label={tr("אחוז שומן משוער, ממדידות סרט", 'Estimated body fat, from tape measurements')} value={tr(`${fmt(b.navyFat - 3.5, 0)}% עד ${fmt(b.navyFat + 3.5, 0)}%`, `${fmt(b.navyFat - 3.5, 0)}% to ${fmt(b.navyFat + 3.5, 0)}%`)} note={tr("נוסחת מותן, צוואר וגובה. השוואה לאחוז של המשקל מראה אם שתיהן נעות יחד.", 'A waist, neck and height formula. Comparing it with the scale\'s number shows if both move together.')} />}
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[T.bold, s.h]}>{tr('מה השפיע', 'What had an effect')}</Text>
        {r.metrics.map((m) => (
          <MetricRow key={m.key} m={m} />
        ))}
      </View>

      {r.patterns.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[T.bold, s.h]}>{tr('דפוסים שלך', 'Your patterns')}</Text>
          {r.patterns.map((p) => (
            <Text key={p} style={[T.base, { fontSize: 14, lineHeight: 21 }]}>
              {p}
            </Text>
          ))}
          <Text style={[T.muted, { fontSize: 12 }]}>{tr('אלה התאמות בנתונים שלך, לא בהכרח סיבה ותוצאה.', 'These are matches in your data, not necessarily cause and effect.')}</Text>
        </View>
      )}

      {r.forecast && (
        <View style={{ gap: 4 }}>
          <Text style={[T.bold, s.h]}>{tr('תחזית', 'Forecast')}</Text>
          <Text style={[T.base, { fontSize: 14, lineHeight: 21 }]}>{r.forecast}</Text>
        </View>
      )}

      {r.flags.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={[T.bold, s.h]}>{tr('שים לב', 'Note')}</Text>
          {r.flags.map((f) => (
            <Text key={f} style={[T.base, { fontSize: 13, lineHeight: 19, color: C.warn }]}>
              {f}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** Top of the progress tab: a new report, or how far the next one is and what it still lacks. */
export function ReportsCard({
  reports,
  progress,
  prefs,
  openId,
  onOpen,
  onClose,
}: {
  reports: Report[];
  progress: Progress | null;
  prefs: ReportPrefs;
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(false);
  const fresh = reports.find((r) => !r.read);
  const open = reports.find((r) => r.id === openId) ?? null;
  // Keep the last report on screen while the drawer slides away
  const lastOpen = useRef<Report | null>(null);
  if (open) lastOpen.current = open;
  const view = open ?? lastOpen.current;
  // Older and newer of the same kind, for paging inside the report
  const same = open ? reports.filter((r) => r.kind === open.kind) : [];
  const idx = open ? same.findIndex((r) => r.id === open.id) : -1;
  const older = idx >= 0 ? same[idx + 1] : undefined;
  const newer = idx > 0 ? same[idx - 1] : undefined;

  useEffect(() => {
    if (openId) setList(false);
  }, [openId]);

  const nextWhen = progress ? tr(`${DAY_NAMES[new Date(progress.week.next).getDay()]} ב${pad2(new Date(progress.week.next).getHours())}:00`, `${DAY_NAMES[new Date(progress.week.next).getDay()]} at ${pad2(new Date(progress.week.next).getHours())}:00`) : '';

  return (
    <>
      {fresh && (
        <Pressable onPress={() => onOpen(fresh.id)} style={s.fresh}>
          <Text style={[T.bold, { fontSize: 13, color: C.signal }]}>{tr('יש דוח', 'A new')} {kindName(fresh)} {tr('חדש ·', 'report ·')} {period(fresh)}</Text>
          <Text style={[T.bold, { fontSize: 17, lineHeight: 25, color: '#fff' }]}>{fresh.headline}</Text>
          <Text style={[T.bold, { fontSize: 14, color: '#BDB8B0' }]}>{tr('פתח את הדוח', 'Open the report')}</Text>
        </Pressable>
      )}

      <Card title={tr("הדוחות", 'Reports')}>
        {prefs.weekly && progress && (
          <View style={{ gap: 6 }}>
            <View style={s.lineTop}>
              <Text style={[T.bold, { fontSize: 14, flex: 1 }]}>{tr('דוח שבועי: יום', 'Weekly report: day')} {progress.week.day} {tr('מתוך 7', 'of 7')}</Text>
              <Text style={[T.muted, { fontSize: 13 }]}>{tr('מוכן ב', 'Ready on ')}{nextWhen}</Text>
            </View>
            <Bar value={progress.week.day} max={7} height={6} />
            {progress.week.missing.map((m) => (
              <Text key={m} style={[T.base, { fontSize: 13, color: C.warn }]}>
                {tr('חסר:', 'Missing:')} {m}
              </Text>
            ))}
          </View>
        )}
        {prefs.monthly && !prefs.weekly && (
          <View style={{ gap: 6 }}>
            {progress?.month ? (
              <>
                <View style={s.lineTop}>
                  <Text style={[T.bold, { fontSize: 14, flex: 1 }]}>{tr('דוח חודשי: יום', 'Monthly report: day')} {progress.month.day} {tr('מתוך 28', 'of 28')}</Text>
                  <Text style={[T.muted, { fontSize: 13 }]}>{tr('ביום הביקורת', 'On check-in day')}</Text>
                </View>
                <Bar value={progress.month.day} max={28} height={6} color={C.data} />
              </>
            ) : (
              <Text style={[T.muted, { fontSize: 13 }]}>{tr('הדוח החודשי מתחיל מנקודת ההתחלה במסע שלך, ויוצא בכל ביקורת.', 'The monthly report starts from your journey\'s starting point, and comes out at every check-in.')}</Text>
            )}
          </View>
        )}
        {!prefs.weekly && !prefs.monthly && <Text style={[T.muted, { fontSize: 13 }]}>{tr('הדוחות כבויים. אפשר להפעיל אותם בהגדרות.', 'Reports are off. You can turn them on in settings.')}</Text>}
        {reports.length > 0 && (
          <View style={s.links}>
            <Pressable onPress={() => onOpen(reports[0].id)} hitSlop={6}>
              <Text style={[T.bold, s.link]}>{tr('הדוח האחרון', 'The last report')}</Text>
            </Pressable>
            <Pressable onPress={() => setList(true)} hitSlop={6}>
              <Text style={[T.bold, s.link]}>{tr('כל הדוחות (', 'All reports (')}{reports.length})</Text>
            </Pressable>
          </View>
        )}
      </Card>

      <Sheet open={list} onClose={() => setList(false)} title={tr("כל הדוחות", 'All reports')}>
        {reports.map((r) => (
          <Pressable key={r.id} onPress={() => onOpen(r.id)} style={s.line}>
            <View style={s.lineTop}>
              <Text style={[T.bold, { fontSize: 14, flex: 1 }]}>
                {kindName(r)} · {period(r)}
              </Text>
              <Chip text={VERDICT_LABEL[r.verdict]} color={VERDICT_COLOR[r.verdict]} />
            </View>
            <Text style={[T.muted, { fontSize: 13 }]} numberOfLines={1}>
              {r.headline}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <Sheet open={!!open} onClose={onClose} title={view ? tr(`דוח ${kindName(view)} · ${period(view)}`, `${kindName(view)} report · ${period(view)}`) : undefined}>
        {view && (
          <>
            <ReportView r={view} />
            {/* Earlier on the right, as Hebrew reads, later on the left; each says which week it opens */}
            <View style={s.nav}>
              {older ? (
                <Pressable onPress={() => onOpen(older.id)} style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.7 }]}>
                  <Ionicons name={CHEVRON_BACK} size={16} color={C.ink} />
                  <View>
                    <Text style={[T.bold, { fontSize: 13 }]}>{view.kind === 'month' ? tr('חודש קודם', 'Previous month') : tr('שבוע קודם', 'Previous week')}</Text>
                    <Text style={[T.muted, { fontSize: 12 }]}>{period(older)}</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {newer ? (
                <Pressable onPress={() => onOpen(newer.id)} style={({ pressed }) => [s.navBtn, { flexDirection: 'row' }, pressed && { opacity: 0.7 }]}>
                  <Ionicons name={CHEVRON_ON} size={16} color={C.ink} />
                  <View>
                    <Text style={[T.bold, { fontSize: 13 }]}>{view.kind === 'month' ? tr('חודש אחרי', 'Next month') : tr('שבוע אחרי', 'Next week')}</Text>
                    <Text style={[T.muted, { fontSize: 12 }]}>{period(newer)}</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  chip: { fontSize: 12, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  line: { gap: 2, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.track },
  lineTop: { flexDirection: ROW, alignItems: 'center', gap: 8 },
  h: { fontSize: 16, marginBottom: 2 },
  action: { backgroundColor: C.ink, borderRadius: 16, padding: 14, gap: 4 },
  fresh: { backgroundColor: C.ink, borderRadius: 24, padding: 16, gap: 6 },
  links: { flexDirection: ROW, justifyContent: 'space-between', paddingTop: 4 },
  nav: { flexDirection: ROW, gap: 10, paddingTop: 8 },
  navBtn: { flex: 1, flexDirection: ROW, alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  link: { fontSize: 13, color: C.muted, textDecorationLine: 'underline' },
});
