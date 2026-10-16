// Cosmetics, achievements and local records (stored per device in localStorage).
export const HATS = {
  none:    { name: 'Без шапки' },
  cap:     { name: 'Кепка' },
  horns:   { name: 'Рожки', wins: 1 },
  crown:   { name: 'Корона', wins: 3 },
  wizard:  { name: 'Колпак мага', wins: 5 },
  tophat:  { name: 'Цилиндр', wins: 10 },
  witch:   { name: 'Шляпа ведьмы', ach: 'season_hw' },
  pumpkin: { name: 'Голова-тыква', ach: 'boo' },
  ushanka: { name: 'Ушанка', ach: 'season_winter' },
  santa:   { name: 'Шапка Деда Мороза', ach: 'season_ny' },
  viking:  { name: 'Шлем викинга', ach: 'triple_bomb' },
};
export const CAPES = {
  none:   { name: 'Без плаща' },
  red:    { name: 'Красный плащ', wins: 1, col: '#c8463d' },
  purple: { name: 'Фиолетовый плащ', wins: 4, col: '#8e58b0' },
  gold:   { name: 'Золотой плащ', wins: 8, col: '#e0b252' },
  star:   { name: 'Звёздный плащ', ach: 'king', col: '#23234f' },
  green:  { name: 'Плащ лесника', ach: 'ctf_win', col: '#3f7a2c' },
};
export const TRAILS = {
  none:    { name: 'Без следа' },
  sparkle: { name: 'Искры', wins: 2 },
  hearts:  { name: 'Сердечки', ach: 'first_win' },
  fire:    { name: 'Огонь', wins: 6 },
  snow:    { name: 'Снежинки', ach: 'season_winter' },
  leaves:  { name: 'Листья', ach: 'traveler' },
  bubbles: { name: 'Пузыри', ach: 'glutton' },
  rainbow: { name: 'Радуга', wins: 15 },
};

export const ACH = {
  first_win:   { name: 'Первая победа', desc: 'Выиграй любой раунд' },
  wins10:      { name: 'Чемпион', desc: '10 побед' },
  marathon:    { name: 'Марафонец', desc: 'Сыграй 20 раундов' },
  never_it:    { name: 'Неуловимый', desc: 'Классика: ни секунды не быть квачом' },
  cold_hands:  { name: 'Холодные руки', desc: 'Выиграй «Горячую картошку»' },
  last_one:    { name: 'Последний герой', desc: 'Заражение: останься единственным выжившим' },
  bomber_win:  { name: 'Подрывник', desc: 'Выиграй бомбермена' },
  triple_bomb: { name: 'Дуплет', desc: 'Подорви двоих одной бомбой' },
  flag_hero:   { name: 'Знаменосец', desc: 'Принеси 2 флага за матч' },
  ctf_win:     { name: 'Командный игрок', desc: 'Выиграй захват флага' },
  hide_master: { name: 'Мастер пряток', desc: 'Прятки: тебя так и не нашли' },
  seeker:      { name: 'Ищейка', desc: 'Прятки: найди троих за раунд' },
  king:        { name: 'Король горы', desc: 'Выиграй «Короля горы»' },
  glutton:     { name: 'Обжора', desc: 'Пакмен: съешь 4 моба за матч' },
  pac_clear:   { name: 'Пылесос', desc: 'Пакмен: 150 точек за матч' },
  rune_master: { name: 'Рунолог', desc: 'Используй 10 рун за матч' },
  gold_digger: { name: 'Золотоискатель', desc: 'Подбери золотую руну' },
  boo:         { name: 'Бу!', desc: 'Напугай троих, будучи призраком' },
  traveler:    { name: 'Путешественник', desc: '5 порталов за матч' },
  gifts:       { name: 'Щедрый Дед', desc: 'Открой 3 подарка за матч' },
  season_hw:   { name: 'Сезон тыкв', desc: 'Сыграй в теме Хэллоуин' },
  season_winter: { name: 'Снежный ком', desc: 'Сыграй в зимней теме' },
  season_ny:   { name: 'С Новым годом!', desc: 'Сыграй в новогодней теме' },
};

const KEY = 'kvach-stats-v1';
export function loadStats() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) { }
  return { v: 1, games: 0, wins: 0, winsBy: {}, ach: {}, best: {} };
}
export function saveStats(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }

export function unlocked(item, stats) {
  if (!item.wins && !item.ach) return true;
  if (item.wins && stats.wins >= item.wins) return true;
  return !!(item.ach && stats.ach[item.ach]);
}
export function reqText(item) {
  if (item.wins) return `${item.wins} побед`;
  if (item.ach) return `ачивка «${ACH[item.ach].name}»`;
  return '';
}

// apply one finished round to local stats; returns newly earned achievements
export function recordResult(stats, res, myId) {
  const me = res.rows.find(r => r.id === myId);
  if (!me) return [];
  const st = me.st || {};
  const got = [];
  const give = k => { if (!stats.ach[k]) { stats.ach[k] = Date.now(); got.push(k); } };
  stats.games++;
  if (me.win) { stats.wins++; stats.winsBy[res.mode] = (stats.winsBy[res.mode] || 0) + 1; give('first_win'); }
  if (stats.wins >= 10) give('wins10');
  if (stats.games >= 20) give('marathon');
  const best = (k, v, lower) => { if (v == null) return; const o = stats.best[k]; if (o == null || (lower ? v < o : v > o)) stats.best[k] = v; };
  if (res.mode === 'classic') { if (me.score === 0) give('never_it'); if (me.win) best('classic', me.score, true); }
  if (res.mode === 'bomb' && me.win) give('cold_hands');
  if (res.mode === 'infect' && me.win && res.rows.filter(r => r.win).length === 1) give('last_one');
  if (res.mode === 'bomber') { if (me.win) give('bomber_win'); if (st.bombMax >= 2) give('triple_bomb'); best('bomber', me.score); }
  if (res.mode === 'ctf') { if (st.caps >= 2) give('flag_hero'); if (me.win) give('ctf_win'); best('ctf', st.caps); }
  if (res.mode === 'hide') { if (!me.it) give('hide_master'); if (st.found >= 3) give('seeker'); }
  if (res.mode === 'koth') { if (me.win) give('king'); best('koth', me.score); }
  if (res.mode === 'pacman') { if (st.mobs >= 4) give('glutton'); if (st.pellets >= 150) give('pac_clear'); best('pacman', me.score); }
  if (st.runes >= 10) give('rune_master');
  if (st.gold) give('gold_digger');
  if (st.boos >= 3) give('boo');
  if (st.portals >= 5) give('traveler');
  if (st.gifts >= 3) give('gifts');
  if (res.theme === 'halloween') give('season_hw');
  if (res.theme === 'winter' || res.theme === 'newyear') give('season_winter');
  if (res.theme === 'newyear') give('season_ny');
  best('runes', st.runes);
  saveStats(stats);
  return got;
}
