const url = new URL(process.env.DISPOSABLE_DATABASE_URL ?? "");
const esc = (value) => `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
const database = (url.pathname || "/postgres").replace(/^\//, "") || "postgres";

process.stdout.write(
  [
    `PGHOST=${esc(url.hostname)}`,
    `PGPORT=${esc(url.port || "5432")}`,
    `PGUSER=${esc(decodeURIComponent(url.username))}`,
    `PGPASSWORD=${esc(decodeURIComponent(url.password))}`,
    `PGDATABASE=${esc(database)}`,
  ].join(" "),
);
