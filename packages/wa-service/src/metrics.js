import fs from 'fs';
import os from 'os';

export function readCgroupMem() {
  // cgroup v2
  try {
    const max = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const cur = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();
    if (max && max !== 'max') {
      const total = Number(max);
      const used = Number(cur);
      if (total > 0) return { total, used };
    }
  } catch {
    /* ignore */
  }
  // cgroup v1
  try {
    const total = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
    const used = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim());
    if (total > 0 && total < os.totalmem() * 4) return { total, used };
  } catch {
    /* ignore */
  }
  return null;
}

export function memStats() {
  const cg = readCgroupMem();
  let total;
  let used;
  if (cg) {
    total = cg.total;
    used = cg.used;
  } else {
    total = os.totalmem();
    used = total - os.freemem();
  }
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return { mem_pct: pct, mem_total: total, mem_used: used };
}
