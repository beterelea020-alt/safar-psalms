/**
 * plans.js — local reading plans (section 28). No backend; progress stored in localStorage.
 */

const Plans = {
  async generate(days) {
    const total = await PsalmsData.count();
    const perDay = Math.ceil(total / days);
    const plan = { days, perDay, createdAt: Date.now(), completedDays: [], startPsalm: 1 };
    const schedule = [];
    let cursor = 1;
    for (let d = 1; d <= days && cursor <= total; d++) {
      const from = cursor;
      const to = Math.min(total, cursor + perDay - 1);
      schedule.push({ day: d, from, to });
      cursor = to + 1;
    }
    plan.schedule = schedule;
    Store.setPlan(plan);
    return plan;
  },

  get() { return Store.getPlan(); },

  markDayComplete(day) {
    const plan = Store.getPlan();
    if (!plan) return null;
    if (!plan.completedDays.includes(day)) plan.completedDays.push(day);
    Store.setPlan(plan);
    return plan;
  },

  currentDay(plan) {
    if (!plan) return null;
    const nextDay = plan.schedule.find(s => !plan.completedDays.includes(s.day));
    return nextDay || null;
  },
};
