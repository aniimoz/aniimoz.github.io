/*
 * Aniimo — Dữ liệu hệ tương khắc
 * Nguồn: Aniimo-He-Tuong-Khac.md (màn "Tra Cứu Tương Khắc" trong game).
 * Hệ số: Siêu hiệu quả = ×1.6 (S) · Trung tính = ×1.0 (N) · Không hiệu quả = ×0.625 (W)
 */

const S = 1.6, N = 1.0, W = 0.625;

const ELEMENTS = [
  { id: 'bang',     name: 'Băng',     en: 'Ice',      emoji: '❄️', color: '#7dd3fc' },
  { id: 'nuoc',     name: 'Nước',     en: 'Water',    emoji: '💧', color: '#2563eb' },
  { id: 'dien',     name: 'Điện',     en: 'Electric', emoji: '⚡', color: '#eab308' },
  { id: 'lua',      name: 'Lửa',      en: 'Fire',     emoji: '🔥', color: '#ef4444' },
  { id: 'co',       name: 'Cỏ',       en: 'Grass',    emoji: '🍃', color: '#22c55e' },
  { id: 'tho',      name: 'Thổ',      en: 'Earth',    emoji: '⛰️', color: '#b5831f' },
  { id: 'phong',    name: 'Phong',    en: 'Wind',     emoji: '🌀', color: '#2dd4bf' },
  { id: 'am',       name: 'Ám',       en: 'Dark',     emoji: '🟣', color: '#a855f7' },
  { id: 'anh-sang', name: 'Ánh sáng', en: 'Light',    emoji: '☀️', color: '#f59e0b' },
];

/*
 * Ma trận khắc hệ 9×9.
 * HÀNG = hệ TẤN CÔNG · CỘT = hệ PHÒNG THỦ.
 * Thứ tự cả hàng lẫn cột: bang, nuoc, dien, lua, co, tho, phong, am, anh-sang.
 * Ô = hệ số khi hàng đánh cột.
 */
const MATRIX = [
  /* Băng → */     [W, S, S, W, N, W, N, N, N],
  /* Nước → */     [W, W, N, S, W, S, N, N, W],
  /* Điện → */     [W, S, W, N, N, W, S, N, N],
  /* Lửa → */      [S, W, N, W, S, W, N, N, W],
  /* Cỏ → */       [N, S, N, W, W, S, N, N, W],
  /* Thổ → */      [S, W, N, S, W, W, N, W, N],
  /* Phong → */    [N, N, W, N, S, N, W, S, N],
  /* Ám → */       [N, W, S, N, S, N, W, N, S],
  /* Ánh sáng → */ [N, N, W, N, N, N, S, S, W],
];

const IDX = Object.fromEntries(ELEMENTS.map((e, i) => [e.id, i]));
const BY_ID = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]));

/* Hệ số khi hệ `attId` tấn công hệ `defId`. */
function mult(attId, defId) {
  return MATRIX[IDX[attId]][IDX[defId]];
}
