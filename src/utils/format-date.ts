const pad = (n: number) => String(n).padStart(2, '0')

const datePart = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Local time as YYYY-MM-DD_HH-mm-ss (safe for filenames) */
export const fileTimestamp = (d: Date = new Date()) =>
  `${datePart(d)}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`

/** Local time as YYYY-MM-DD HH:mm:ss */
export const displayTimestamp = (d: Date = new Date()) =>
  `${datePart(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
