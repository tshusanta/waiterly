import { ChartBar, ClipboardCheck, ListChecks, MessageSquare, PenLine } from 'lucide-react'
import { NOTE_MAX_CHARS } from '../../shared/parse/types'
import { RESTAURANT } from '../../shared/restaurant'
import { QUICK_TAPS } from '../../shared/quickTap'
import { PARSE_RULES, TABLE_RULES, VISIT_RULES } from '../../shared/rules'
import { TRANSCRIPT_MAX_CHARS } from '../../shared/visit/types'
import { SCENARIOS } from '../../shared/scenarios'
import { PARSE_SYSTEM_PROMPT, VISIT_SYSTEM_PROMPT } from '../../server/prompt'
import { MIC_NOTICE_TEXT } from '../lib/visitRecorder'
import { AiStatusBadge } from '../components/Badge'
import type { Health } from '../lib/api'

// A real sequence, so it is numbered.
const FLOW = [
  { icon: MessageSquare, title: 'Guest asks', text: 'A table asks for water, a sauce, the check or an allergy answer.' },
  { icon: PenLine, title: 'Server captures', text: 'A quick button for simple asks, a voice visit at the table, or a typed note covering several tables.' },
  { icon: ListChecks, title: 'AI organizes', text: 'The AI turns the visit or note into the final tasks per table, flagged and prioritized. Code then checks every field and every table.' },
  { icon: ClipboardCheck, title: 'Server verifies and completes', text: 'Nothing from the AI is added until the server confirms it. Overdue tasks rise to the top. Tasks are checked off as they are done.' },
  { icon: ChartBar, title: 'Manager reviews', text: 'Floor stats show waits, request patterns and every safeguard, plus an AI shift summary.' },
]

const SAFEGUARDS: { what: string; how: string; where: string }[] = [
  {
    what: 'Server confirms every AI task',
    how: 'Tasks from a visit or typed note wait in the "Check before adding" card. The server can change the table (section tables only), edit or remove a task, and choose between what the guest said and the read-back when they differ. Ready items go out on "Send ready items (N)". Held items (no clear table, sold out or not on the menu, guest and read-back differ) wait under "Needs you" with one-tap fixes, and each one is sent the moment it is fixed. One problem item never blocks the rest.',
    where: 'UI',
  },
  {
    what: 'Allergies always flagged, never called safe',
    how: 'Rule 5 in the prompt. Code also forces the ALLERGY flag, high priority and "Confirm with kitchen before serving" on any allergy or dietary mention, and rewrites "it\'s safe" claims.',
    where: 'Prompt + code',
  },
  {
    what: 'Tables outside the section rejected',
    how: 'Code rejects any task whose table is not in the section, whatever the model returns.',
    where: 'Code',
  },
  {
    what: 'Unclear requests come back as questions',
    how: 'Rule 3. Code also turns a task into a question if its table number never appears in the note, which catches invented tables.',
    where: 'Prompt + code',
  },
  {
    what: 'Prompt injection rejected, no payment actions',
    how: 'The note is sent inside <note> tags as data (rule 8). Code rejects any "paid", "comp", "refund" or "void" task. The app has no payment features to abuse.',
    where: 'Prompt + code',
  },
  {
    what: 'Table rules enforced in code',
    how: 'A visit from a card uses that table unless another is said. A different spoken table means the server picks between the two. A self-correction ("table 1, sorry, 7") uses the correction. No table means the item waits under "Needs you" with a button for each section table; the other items are not held up. Tables outside the section are refused. A table the model names but nobody said is ignored.',
    where: 'Code + UI',
  },
  {
    what: 'Mic only during a visit, text only',
    how: 'Listening starts only when the server taps a mic and ends on Stop, after 20 seconds of silence, or at 10 minutes. No audio is recorded or stored. Only the text transcript is kept, in memory, until it is organized. A one-time notice explains this.',
    where: 'UI',
  },
  {
    what: 'Output schema-validated and sanitized',
    how: 'Structured output with a strict JSON schema. Categories, priorities and flags are whitelisted. Text is trimmed to 8 words, markup is stripped, and at most 15 tasks are kept. All AI text is rendered as plain text, never HTML.',
    where: 'API + code',
  },
  {
    what: 'Fallback when AI is down',
    how: 'A keyword parser, rule-based trip planner and stats-based summary run when no API key is set, on any AI error, or after a 15 second timeout. The FALLBACK MODE badge says so. The endpoints never return a server error: even an unexpected bug returns a safe, readable answer.',
    where: 'Code + UI',
  },
  {
    what: 'API key server-side, rate limited',
    how: 'Keys (ANTHROPIC_API_KEY or GEMINI_API_KEY) live only in server environment variables. The browser never sees them. Each IP gets 20 parse or plan requests and 10 summaries per minute.',
    where: 'Server',
  },
  {
    what: 'Summary cannot invent numbers',
    how: 'The summary model receives computed stats only. Any line containing a number that is not in those stats is dropped.',
    where: 'Code',
  },
  {
    what: 'No personal data',
    how: 'Synthetic restaurant and tasks, no guest names or payment data. Each tester\'s shift is stored only in their own browser.',
    where: 'Design',
  },
]

interface Props {
  aiMode: 'ai' | 'fallback' | 'checking'
  health: Health | null
  onTryScenario: (note: string) => void
}

export function HowView({ aiMode, health, onTryScenario }: Props) {
  return (
    <div className="how">
      <section className="card" aria-labelledby="flow-title">
        <div className="card-head">
          <h2 id="flow-title">The flow</h2>
        </div>
        <ol className="flow">
          {FLOW.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flow-step">
              <span className="flow-num mono" aria-hidden="true">{i + 1}</span>
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <h3>{title}</h3>
              <p className="muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="how-grid">
        <section className="card" aria-labelledby="rules-title">
          <div className="card-head">
            <h2 id="rules-title">AI rules</h2>
          </div>
          <p className="muted small">These are the exact rules in the system prompt. The page reads them from the same file.</p>
          <ol className="rules">
            {PARSE_RULES.map((rule, i) => (
              <li key={i}>
                <span className="mono muted">{i + 1}</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
          <details className="prompt-details">
            <summary>Full system prompt</summary>
            <pre className="prompt-text">{PARSE_SYSTEM_PROMPT}</pre>
          </details>
        </section>

        <div className="how-side">
          <section className="card" aria-labelledby="models-title">
            <div className="card-head">
              <h2 id="models-title">Models</h2>
              <AiStatusBadge mode={aiMode} />
            </div>
            <dl className="facts">
              <dt>Active now</dt>
              <dd>
                {health === null
                  ? 'Checking…'
                  : health.aiConfigured
                    ? `${health.label ?? health.provider}: ${health.models?.parse}${health.models?.summary !== health.models?.parse ? ` and ${health.models?.summary}` : ''}`
                    : 'No AI key is set on this server, so every feature runs on its plain-code fallback.'}
              </dd>
              <dt>How it's chosen</dt>
              <dd>
                By server setting: <span className="mono">ANTHROPIC_API_KEY</span> uses Claude (
                <span className="mono">claude-haiku-5-5</span> to parse and plan, <span className="mono">claude-sonnet-5-5</span> for
                the summary). Otherwise <span className="mono">GEMINI_API_KEY</span> uses <span className="mono">gemini-3.8-flash</span> (or <span className="mono">GEMINI_MODEL</span>).
                With neither, the fallbacks run.
              </dd>
              <dt>Fallbacks</dt>
              <dd>Keyword parser, rule-based trip planner and stats-based summary. They also run whenever the AI is slow or fails.</dd>
              <dt>Same safeguards</dt>
              <dd>Every provider's output goes through the same validation code, so switching AI can't skip a safeguard.</dd>
            </dl>
          </section>

          <section className="card" aria-labelledby="context-title">
            <div className="card-head">
              <h2 id="context-title">Restaurant context</h2>
              <span className="badge badge-neutral">Synthetic</span>
            </div>
            <dl className="facts">
              <dt>Restaurant</dt>
              <dd>{RESTAURANT.name}, a {RESTAURANT.type}</dd>
              <dt>86'd tonight</dt>
              <dd>{RESTAURANT.soldOut.join(', ')}</dd>
              <dt>Free refills</dt>
              <dd>{RESTAURANT.freeRefills.join(', ')}</dd>
              <dt>Allergy policy</dt>
              <dd>{RESTAURANT.allergyPolicy}</dd>
              <dt>Menu</dt>
              <dd>{RESTAURANT.menu.join(', ')}</dd>
            </dl>
          </section>
        </div>
      </div>

      <section className="card" aria-labelledby="visit-title">
        <div className="card-head">
          <h2 id="visit-title">Table visits, quick taps and alerts</h2>
        </div>
        <div className="how-grid">
          <div>
            <h3 className="field-label">Visit rules (in the visit system prompt, word for word)</h3>
            <ol className="rules">
              {VISIT_RULES.map((rule, i) => (
                <li key={i}>
                  <span className="mono muted">{i + 1}</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ol>
            <details className="prompt-details">
              <summary>Full visit system prompt</summary>
              <pre className="prompt-text">{VISIT_SYSTEM_PROMPT}</pre>
            </details>
          </div>
          <div>
            <h3 className="field-label">Table rules (enforced in code)</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Then</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_RULES.map((r) => (
                    <tr key={r.when}>
                      <th scope="row">{r.when}</th>
                      <td>{r.then}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="facts">
              <dt>Starting a visit</dt>
              <dd>The mic on a table card links the visit to that table. The large mic at the bottom of Service starts a visit with no table; say the table number at any point.</dd>
              <dt>Listening</dt>
              <dd>Web Speech API, continuous with live text. Ends on Stop, after 20 seconds of silence, or at a 10-minute cap. If the browser stops recognition on its own, it restarts and keeps adding to the same transcript.</dd>
              <dt>Privacy notice</dt>
              <dd>"{MIC_NOTICE_TEXT}"</dd>
              <dt>Long visits</dt>
              <dd>The most recent {TRANSCRIPT_MAX_CHARS.toLocaleString('en-US')} characters are analyzed, and the AI is told the start was trimmed.</dd>
              <dt>No speech support</dt>
              <dd>Where the browser has no speech recognition (some iPhones, Firefox), the mic opens a text box instead.</dd>
              <dt>Quick taps</dt>
              <dd>{QUICK_TAPS.map((q) => q.label).join(', ')}. One tap adds the task at once, with no AI call and no review, and a 5-second Undo. Check is high priority.</dd>
              <dt>Overdue</dt>
              <dd>Tasks open 5 minutes or more move to the top of their table with an amber "Waiting X min" badge. The tab title shows the count, for example "(2) Waiterly". Phones that support it vibrate once when a task first becomes overdue.</dd>
              <dt>Copy for POS</dt>
              <dd>On the verification card and on allergy tasks. It copies one clean line, for example "T4: 3 waters, 1 Coke no ice". The POS stays the system of record.</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="safeguards-title">
        <div className="card-head">
          <h2 id="safeguards-title">Safeguards</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Safeguard</th>
                <th scope="col">How it works</th>
                <th scope="col">Enforced in</th>
              </tr>
            </thead>
            <tbody>
              {SAFEGUARDS.map((s) => (
                <tr key={s.what}>
                  <th scope="row">{s.what}</th>
                  <td>{s.how}</td>
                  <td className="nowrap"><span className="pill">{s.where}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="scenarios-title">
        <div className="card-head">
          <h2 id="scenarios-title">Test scenarios</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Note</th>
                <th scope="col">Expected result</th>
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {SCENARIOS.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.label}</th>
                  <td className="quote">"{s.note}"</td>
                  <td>{s.expected}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onTryScenario(s.note)} aria-label={`Try the ${s.label} scenario`}>
                      Try it
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">Empty or too long</th>
                <td className="quote">"" or over {NOTE_MAX_CHARS} characters</td>
                <td>Friendly validation message, no API call.</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
