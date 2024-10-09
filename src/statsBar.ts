import { ExtensionContext, StatusBarAlignment, StatusBarItem, window } from 'vscode';
import { ConfigurationKeys } from './types';
import { sysinfoData, SysinfoData, StatsModule, StatsModuleNameMap, siInit, siRelease } from './sysinfo';
import { setting } from './setting';
import { formatBytes, formatTimes, formatByDict, isDarwin } from './utils';

type Await<T extends () => unknown> = T extends () => PromiseLike<infer U> ? U : ReturnType<T>;

class StatsBar {
  statusItems: StatusBarItem[] = [];
  timer: NodeJS.Timeout | null = null;
  _context: ExtensionContext | null = null;

  init(context: ExtensionContext) {
    this._context = context;
    siInit();
    this.start();
  }

  private start() {
    if (!this._context) {
      return;
    }
    if (this.statusItems.length > 0) {
      this.statusItems.forEach(statusItem => {
        statusItem.dispose();
      });
    }
    const curModules = setting.curModules;
    if (!setting?.cfg?.get(ConfigurationKeys.AllEnabled) || curModules.length === 0) {
      return;
    }
    const location = (setting?.cfg?.get(ConfigurationKeys.Location) || 'Left') as StatusBarAlignment;
    const priority: number = setting?.cfg?.get(ConfigurationKeys.Priority) || setting.default.priority;
    this.statusItems = curModules.map(() => window.createStatusBarItem(StatusBarAlignment[location], priority));
    this._context.subscriptions.push(...this.statusItems);
    this.update();
  }

  private async update() {
    this.getSysInfo();
    this.timer = setInterval(() => {
      this.getSysInfo();
    }, setting?.cfg?.get(ConfigurationKeys.RefreshInterval) || setting.default.refreshInterval);
  }

  private async getSysInfo() {
    const promises = setting.curModules.map(async module => {
      const res = await sysinfoData[module]();
      return this.formatRes(module, res) || '-';
    });
    const res = await Promise.all(promises);
    res.forEach((data, index) => {
      if (data.text === '-') {
        return;
      }
      const curStatusItem = this.statusItems[index];
      curStatusItem.text = data.text;
      curStatusItem.tooltip = data.tooltip || StatsModuleNameMap[data.module];
      curStatusItem.show();
    });
  }

  private formatRes(module: StatsModule, rawRes: unknown) {
    const formatters = {
      cpuLoad: this.formatCpuLoad,
      loadavg: this.formatLoadavg,
      memoUsage: this.formatMemoUsage,
      networkSpeed: this.formatNetworkSpeed,
      uptime: this.formatUptime,
      gpuLoad: this.formatGpuLoad
    };

    const formatedData = {
      module,
      text: '-',
      tooltip: ''
    };

    const formatter = formatters[module];
    if (formatter) {
      formatedData.text = formatter.call(this, rawRes);
    }

    return formatedData;
  }

  private formatCpuLoad(rawRes: unknown) {
    const res = rawRes as Await<SysinfoData['cpuLoad']>;
    if (res) {
      const dict = { percent: res.toFixed(0) };
      return formatByDict(setting.cfg?.get(ConfigurationKeys.CpuLoadFormat), dict);
    }
    return '-';
  }

  private formatLoadavg(rawRes: unknown) {
    const res = rawRes as Await<SysinfoData['loadavg']>;
    if (res) {
      const dict = {
        '1': res[0]?.toFixed(2) || 0,
        '5': res[1]?.toFixed(2) || 0,
        '15': res[2]?.toFixed(2) || 0
      };
      return formatByDict(setting.cfg?.get(ConfigurationKeys.LoadavgFormat), dict);
    }
    return '-';
  }

  private formatMemoUsage(rawRes: unknown) {
    const res = rawRes as Await<SysinfoData['memoUsage']>;
    if (res) {
      const customSize = 1024 * 1024 * 1024;
      const used = formatBytes(isDarwin ? res.used : res.active, 2, customSize);
      const total = formatBytes(res.total, 2, customSize);
      const percent = ((Number(used.data) / Number(total.data)) * 100).toFixed(0);
      const pressurePercent = Number((res.pressurePercent || 0) * 100).toFixed(0);

      const dict = {
        used: used.data,
        total: total.data,
        unit: 'GB',
        percent,
        pressurePercent
      };

      return formatByDict(setting.cfg?.get(ConfigurationKeys.MemoUsageFormat), dict);
    }
    return '-';
  }

  private formatNetworkSpeed(rawRes: unknown) {
    const res = rawRes as Await<SysinfoData['networkSpeed']>;
    if (res) {
      const up = formatBytes(res.up);
      const down = formatBytes(res.down);

      const dict = {
        up: up.data,
        'up-unit': up.unit + '/s',
        down: down.data,
        'down-unit': down.unit + '/s'
      };

      return formatByDict(setting.cfg?.get(ConfigurationKeys.NetworkSpeedFormat), dict);
    }
    return '-';
  }

  private formatUptime(rawRes: unknown) {
    const res = rawRes as Await<SysinfoData['uptime']>;
    if (res) {
      const data = formatTimes(res);

      const dict = {
        days: data[0],
        hours: data[1],
        minutes: data[2]
      };

      return formatByDict(setting.cfg?.get(ConfigurationKeys.UptimeFormat), dict);
    }
    return '-';
  }
  private formatGpuLoad(rawRes: unknown) {
    const res = rawRes as Await<SysinfoData['gpuLoad']>;
    if (res && res.length > 0 && res[0]) {
      const dict = {
        percent: Math.round(res[0].gpuUtilization),
        unit: 'GB',
        used: (res[0].usedMemory / 1024).toFixed(2),
        total: (res[0].totalMemory / 1024).toFixed(2),
      };
      return formatByDict(setting.cfg?.get(ConfigurationKeys.GpuLoadFormat), dict);
    }
    return '-';
  }

  onSettingUpdate() {
    this.cancelUpdate();
    this.start();
  }

  cancelUpdate(isDeactivate = false) {
    if (isDeactivate) {
      siRelease();
    }
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}

export const statsBar = new StatsBar();
