const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

function recordWeeklySnapshot(previous, projects, now = Date.now()) {
  const cache = previous && typeof previous === 'object' ? previous : {};
  if (Number(cache.fetchedAt) && now - Number(cache.fetchedAt) < SNAPSHOT_INTERVAL_MS) return cache;
  const history = cache.history && typeof cache.history === 'object' ? { ...cache.history } : {};
  for (const project of Array.isArray(projects) ? projects : []) {
    const id = String(project.project_id || project.id || '');
    const follows = Number(project.follows);
    if (!id || !Number.isFinite(follows)) continue;
    const snapshots = Array.isArray(history[id]) ? history[id] : [];
    snapshots.push({ at: now, follows });
    history[id] = snapshots.filter(item => Number(item.at) >= now - HISTORY_WINDOW_MS).slice(-12);
  }
  return { fetchedAt: now, projects: Array.isArray(projects) ? projects : [], history };
}

function buildWeeklyFavoriteRanking(cache, now = Date.now(), limit = 8) {
  const projects = Array.isArray(cache?.projects) ? cache.projects : [];
  const tracked = projects.map(project => {
    const id = String(project.project_id || project.id || '');
    const snapshots = Array.isArray(cache?.history?.[id]) ? cache.history[id] : [];
    const baseline = snapshots
      .filter(item => Number(item.at) <= now - WEEK_MS + 36 * 60 * 60 * 1000 && Number(item.at) >= now - WEEK_MS - 36 * 60 * 60 * 1000)
      .sort((left, right) => Number(right.at) - Number(left.at))[0];
    const follows = Number(project.follows) || 0;
    return { ...project, follows, weeklyFollows: baseline ? Math.max(0, follows - Number(baseline.follows || 0)) : null };
  });
  const weekly = tracked.filter(project => project.weeklyFollows !== null && project.weeklyFollows > 0)
    .sort((left, right) => right.weeklyFollows - left.weeklyFollows || right.follows - left.follows);
  const allTime = [...tracked].sort((left, right) => right.follows - left.follows);
  const rank = weekly.length ? weekly : allTime;
  return {
    ranking: weekly.length ? 'weekly' : 'all-time',
    daysTracked: Math.min(7, Math.floor(Math.max(0, now - Math.min(...Object.values(cache?.history || {}).flat().map(item => Number(item.at) || now))) / (24 * 60 * 60 * 1000))),
    updatedAt: Number(cache?.fetchedAt) || null,
    mods: rank.slice(0, Math.max(1, Math.min(24, limit))),
    allTimeMods: allTime.slice(0, Math.max(1, Math.min(24, limit)))
  };
}

module.exports = { recordWeeklySnapshot, buildWeeklyFavoriteRanking, WEEK_MS, SNAPSHOT_INTERVAL_MS };
