// 進行状況の保存。ジョブ × 難易度ごとに 1 つ、このブラウザの中に残す。
// GitHub Pages では同じアカウントのリポジトリが保存場所を共有する。v2 の「ftn-save-」には読み書きしない。
const KEY = (job, diff) => `ftn25-save-${job}-${diff}`;
const VERSION = 1;

export function loadSave(job, diff) {
  try {
    const d = JSON.parse(localStorage.getItem(KEY(job, diff)));
    return d && d.v === VERSION && d.job === job && (d.weapon || job === 'summoner') ? d : null;
  } catch (e) { return null; }
}

export function writeSave(d, diff) {
  try { localStorage.setItem(KEY(d.job, diff), JSON.stringify({ ...d, v: VERSION })); return true; } catch (e) { return false; }
}

export function deleteSave(job, diff) {
  try { localStorage.removeItem(KEY(job, diff)); } catch (e) { /* 無視 */ }
}

// 別のブラウザへ移すための文字列
export const exportSave = (d) => btoa(encodeURIComponent(JSON.stringify(d)));
export function importSave(text) {
  try {
    const d = JSON.parse(decodeURIComponent(atob(text.trim())));
    return d && d.v === VERSION && d.job && (d.weapon || d.job === 'summoner') ? d : null;
  } catch (e) { return null; }
}
