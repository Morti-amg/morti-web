// What one learner did (kept on this device): review boxes, favorites, daily count, XP.
const INTERVALS = [0, 1, 2, 4, 8, 16];

function dayString(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

function blank() {
  return {
    box: {}, due: {}, favorites: [], perDay: {}, goal: 10,
    ease: {}, interval: {}, reps: {}, xp: 0, reviews: 0, activeDays: [],
    pronPerfect: 0, tutorMessages: 0,
  };
}

export const GRADES = ['again', 'hard', 'good', 'easy'];
const GRADE_XP = { again: 2, hard: 5, good: 10, easy: 15 };

class Study {
  constructor() { this.userID = null; this.data = blank(); }

  key(id) { return 'study_' + id; }

  load(id) {
    this.userID = id;
    this.data = blank();
    if (!id) return;
    try {
      const raw = localStorage.getItem(this.key(id));
      if (raw) this.data = Object.assign(blank(), JSON.parse(raw));
    } catch (e) {}
  }

  save() {
    if (!this.userID) return;
    try { localStorage.setItem(this.key(this.userID), JSON.stringify(this.data)); } catch (e) {}
  }

  // ---- daily goal ----
  get todayCount() { return this.data.perDay[dayString()] || 0; }
  get goal() { return this.data.goal; }
  setGoal(v) { this.data.goal = v; this.save(); }

  // ---- smart review (SM-2 style) ----
  record(word, known) { return this.grade(word, known ? 'good' : 'again'); }

  grade(word, g) {
    const id = word.id, d = this.data;
    const oldEase = d.ease[id] ?? 2.5;
    const oldInterval = d.interval[id] ?? 0;
    const oldReps = d.reps[id] ?? 0;
    let ease = oldEase, interval = oldInterval, reps = oldReps;
    const now = Date.now();
    if (g === 'again') {
      reps = 0; interval = 0; ease = Math.max(1.3, oldEase - 0.2);
      d.due[id] = now + 10 * 60 * 1000;
    } else {
      if (g === 'hard') {
        reps = oldReps + 1; interval = Math.max(1, oldInterval * 1.2); ease = Math.max(1.3, oldEase - 0.15);
      } else if (g === 'good') {
        reps = oldReps + 1;
        interval = oldReps === 0 ? 1 : oldReps === 1 ? 3 : Math.max(1, oldInterval) * oldEase;
      } else {
        reps = oldReps + 1;
        interval = oldReps === 0 ? 3 : Math.max(1, oldInterval) * oldEase * 1.3;
        ease = Math.min(3.0, oldEase + 0.15);
      }
      interval = Math.min(interval, 365);
      d.due[id] = now + interval * 86400000;
    }
    d.ease[id] = ease; d.interval[id] = interval; d.reps[id] = reps;
    d.box[id] = Math.min(5, reps);
    d.reviews += 1;
    d.xp += GRADE_XP[g];
    if (g !== 'again') d.perDay[dayString()] = (d.perDay[dayString()] || 0) + 1;
    this.markActive();
    this.save();
    return GRADE_XP[g];
  }

  addXP(n) { this.data.xp += n; this.markActive(); this.save(); }
  notePronunciation(score) {
    if (score >= 85) this.data.pronPerfect += 1;
    this.addXP(score >= 85 ? 12 : score >= 60 ? 6 : 2);
  }
  markActive() {
    const t = dayString();
    if (!this.data.activeDays.includes(t)) {
      this.data.activeDays.push(t);
      if (this.data.activeDays.length > 800) this.data.activeDays.splice(0, this.data.activeDays.length - 800);
    }
  }

  // ---- XP / level / streak ----
  get xp() { return this.data.xp; }
  get level() { return Math.floor(Math.sqrt(this.data.xp / 50)) + 1; }
  get xpForThisLevel() { return 50 * (this.level - 1) ** 2; }
  get xpForNextLevel() { return 50 * this.level ** 2; }
  get levelFraction() {
    const span = this.xpForNextLevel - this.xpForThisLevel;
    return span <= 0 ? 0 : Math.min(1, (this.data.xp - this.xpForThisLevel) / span);
  }
  get xpToNext() { return Math.max(0, this.xpForNextLevel - this.data.xp); }

  get currentStreak() {
    const set = new Set(this.data.activeDays);
    let day = new Date();
    if (!set.has(dayString(day))) day.setDate(day.getDate() - 1);
    let n = 0;
    while (set.has(dayString(day))) { n++; day.setDate(day.getDate() - 1); }
    return n;
  }
  get bestStreak() {
    const days = [...this.data.activeDays].sort();
    let best = 0, run = 0, prev = null;
    for (const s of days) {
      const date = parseDay(s);
      if (prev) {
        const next = new Date(prev); next.setDate(next.getDate() + 1);
        run = dayString(next) === s ? run + 1 : 1;
      } else run = 1;
      best = Math.max(best, run); prev = date;
    }
    return best;
  }

  // ---- ordering and due ----
  ordered(words) {
    const now = Date.now();
    return [...words].sort((a, b) => {
      const da = this.data.due[a.id] ?? -Infinity, db = this.data.due[b.id] ?? -Infinity;
      const dueA = da <= now, dueB = db <= now;
      if (dueA !== dueB) return dueA ? -1 : 1;
      if (da !== db) return da < db ? -1 : 1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }
  dueCount(words) {
    const now = Date.now();
    return words.filter(w => (this.data.due[w.id] ?? -Infinity) <= now).length;
  }
  /** Cards that are due now plus a few new ones. */
  dueWords(words, limit = 20, newLimit = 8) {
    const now = Date.now();
    const seen = [], fresh = [];
    for (const w of words) {
      const due = this.data.due[w.id];
      if (due !== undefined) { if (due <= now) seen.push(w); } else fresh.push(w);
    }
    seen.sort((a, b) => this.data.due[a.id] - this.data.due[b.id]);
    const take = seen.slice(0, limit);
    const shuffled = fresh.sort(() => Math.random() - 0.5);
    const room = Math.max(0, Math.min(newLimit, limit - take.length));
    return take.concat(shuffled.slice(0, room)).slice(0, limit);
  }

  // ---- favorites ----
  isFavorite(w) { return this.data.favorites.includes(w.id); }
  toggleFavorite(w) {
    const i = this.data.favorites.indexOf(w.id);
    if (i >= 0) this.data.favorites.splice(i, 1); else this.data.favorites.push(w.id);
    this.save();
  }
}

export const study = new Study();
export { dayString };
