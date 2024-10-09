import * as si from 'systeminformation';
import * as os from 'os';
import { getMacOsMemoryUsageInfo } from './memory';
import { isDarwin, isWin32 } from '../utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
import { spawn } from 'child_process';


export function siInit() {
  if (isWin32) {
    si.powerShellStart();
  }
}

export function siRelease() {
  if (isWin32) {
    si.powerShellRelease();
  }
}

export async function getCpuSpeed() {
  try {
    const res = await si.cpuCurrentSpeed();
    return res.avg;
  } catch (err) { }
}

export async function getCpuLoad() {
  try {
    const res = await si.currentLoad();
    return res.currentLoad;
  } catch (err) { }
}

export async function getLoadavg() {
  try {
    const res = os.loadavg();
    return res;
  } catch (err) { }
}

export async function getIP() {
  const defaultInterface = await si.networkInterfaceDefault();
  const res = await si.networkInterfaces();
  const interfaces = Array.isArray(res) ? res : [res];
  const cur = interfaces.find(item => item.iface === defaultInterface);
  return cur?.ip4;
}

export async function getNetworkSpeed() {
  try {
    const defaultInterface = await si.networkInterfaceDefault();
    const res = await si.networkStats(defaultInterface);
    const cur = res[0];
    return {
      up: cur.tx_sec,
      down: cur.rx_sec
    };
  } catch (err) { }
}

export async function getUpTime() {
  try {
    return os.uptime();
  } catch (err) { }
}

export async function getMemoryUsage() {
  try {
    if (isDarwin) {
      const res = await getMacOsMemoryUsageInfo();
      return {
        total: res.total,
        used: res.used,
        active: res.active,
        pressurePercent: res.pressurePercent,
        usagePercent: res.usagePercent
      };
    } else {
      const res = await si.mem();
      return {
        total: res.total,
        used: res.used,
        active: res.active
      };
    }
  } catch (err) { }
}

async function getX86GpuInfo() {
  try {
    const { stdout, stderr } = await execPromise('nvidia-smi --query-gpu=memory.total,memory.used,utilization.gpu --format=csv,noheader,nounits');
    if (stderr) {
      return null;
    }

    const lines = stdout.trim().split('\n');
    const gpuInfo = lines.map(line => {
      const [totalMemory, usedMemory, gpuUtilization] = line.split(', ').map(Number);
      return {
        totalMemory,
        usedMemory,
        gpuUtilization,
      };
    });
    return gpuInfo;
  } catch (error) {
    return null;
  }
}

async function getTegraInfo() {
  try {
    const { stdout, stderr } = await execPromise('tegrastats');
    if (stderr) {
      return null;
    }

    const lines = stdout.trim().split('\n');
    const tegraInfo = lines.map(line => {
      const match = line.match(/(\d+)\/(\d+)\s+MB\s+(\d+)%/);
      if (match) {
        const usedMemory = Number(match[1]);
        const totalMemory = Number(match[2]);
        const gpuUtilization = Number(match[3]);
        return {
          usedMemory,
          totalMemory,
          gpuUtilization,
        };
      }
      return null;
    }).filter(Boolean);

    return tegraInfo;
  } catch (error) {
    return null;
  }
}

async function detectPlatform() {
  try {
    const { stdout } = await execPromise('uname -m');
    const arch = stdout.trim();

    if (arch === 'x86_64' || arch === 'i686') {
      return await getX86GpuInfo();
    } else if (arch.includes('tegra')) {
      return await getTegraInfo();
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

export async function getGpuLoad() {
  try {
    return detectPlatform();
  } catch (err) { }
}

export const sysinfoData = {
  cpuLoad: getCpuLoad,
  loadavg: getLoadavg,
  networkSpeed: getNetworkSpeed,
  memoUsage: getMemoryUsage,
  uptime: getUpTime,
  gpuLoad: getGpuLoad,
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const AllSysModules = Object.keys(sysinfoData) as StatsModule[];

export type SysinfoData = typeof sysinfoData;

export type StatsModule = keyof typeof sysinfoData;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const StatsModuleNameMap: { [key in StatsModule]: string } = {
  cpuLoad: 'CpuLoad',
  loadavg: 'Loadavg',
  networkSpeed: 'NetworkSpeed',
  memoUsage: 'MemoryUsage',
  uptime: 'Uptime',
  gpuLoad: 'GpuLoad'
};
