import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Bell, Cpu, RefreshCcw, Shield } from 'lucide-react';
import { aiApi, AiUsageSummary, MonitorSnapshot } from '../api/ai';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

export const AiMonitorView = () => {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usageSummary, monitorSnapshot] = await Promise.all([
        aiApi.getUsageSummary(30),
        aiApi.getMonitorSnapshot(),
      ]);
      setUsage(usageSummary);
      setSnapshot(monitorSnapshot);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Не удалось загрузить статистику AI.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dailyData = useMemo(() => usage?.daily ?? [], [usage]);

  const handleUserUpdate = async (
    userId: string,
    update: Partial<{ isMonitored: boolean; detoxifyEnabled: boolean; aiPingEnabled: boolean }>
  ) => {
    const current = snapshot?.users.find((u) => u.id === userId);
    if (!current) return;

    setSavingTarget(`user-${userId}`);
    try {
      await aiApi.updateUserMonitor(userId, {
        isMonitored: update.isMonitored ?? true,
        detoxifyEnabled: update.detoxifyEnabled ?? current.detoxifyEnabled,
        aiPingEnabled: update.aiPingEnabled ?? current.aiPingEnabled,
      });
      await loadData();
    } catch (err) {
      console.error(err);
      setError('Не удалось обновить параметры мониторинга пользователя.');
    } finally {
      setSavingTarget(null);
    }
  };

  const handleChannelUpdate = async (
    channelId: string,
    update: Partial<{ enabled: boolean; detoxifyEnabled: boolean; aiPingEnabled: boolean }>
  ) => {
    const current = snapshot?.channels.find((c) => c.id === channelId);
    if (!current) return;

    setSavingTarget(`channel-${channelId}`);
    try {
      await aiApi.updateChannelMonitor(channelId, {
        enabled: update.enabled ?? true,
        detoxifyEnabled: update.detoxifyEnabled ?? current.detoxifyEnabled,
        aiPingEnabled: update.aiPingEnabled ?? current.aiPingEnabled,
      });
      await loadData();
    } catch (err) {
      console.error(err);
      setError('Не удалось обновить параметры мониторинга канала.');
    } finally {
      setSavingTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <RefreshCcw className="animate-spin" size={20} />
        Загрузка AI-статистики...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20">
        {error}
        <button className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg" onClick={loadData}>
          Повторить попытку
        </button>
      </div>
    );
  }

  if (!usage || !snapshot) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Cpu size={24} className="text-blue-600 dark:text-blue-400" /> AI Usage & Monitor
          </h2>
          <p className="text-gray-500 dark:text-gray-400">Обзор нагрузки и контроль отслеживаемых пользователей/каналов</p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Последние {usage.rangeDays} дней</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Запросы" value={formatNumber(usage.totals.requests)} icon={<Activity size={18} className="text-indigo-600 dark:text-indigo-400" />} />
        <StatCard label="Tokens (Prompt)" value={formatNumber(usage.totals.promptTokens)} icon={<Shield size={18} className="text-emerald-600 dark:text-emerald-400" />} />
        <StatCard label="Tokens (Completion)" value={formatNumber(usage.totals.completionTokens)} icon={<Shield size={18} className="text-teal-600 dark:text-teal-400" />} />
        <StatCard label="Cost" value={formatCurrency(usage.totals.cost)} icon={<Bell size={18} className="text-amber-600 dark:text-amber-400" />} />
      </div>

      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-blue-50 dark:bg-blue-500/20 rounded-lg">
            <Activity className="text-blue-600 dark:text-blue-400" size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Ежедневное использование</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Количество AI-вызовов и стоимость по дням</p>
          </div>
        </div>
        <div className="h-[280px]">
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="aiDaily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(156, 163, 175, 0.2)" />
                <XAxis dataKey="day" tickFormatter={(val) => (typeof val === 'string' ? val.substring(5) : val)} stroke="#9CA3AF" />
                <YAxis allowDecimals={false} stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ borderRadius: 12, backgroundColor: 'rgba(17, 24, 39, 0.9)', border: 'none', color: '#fff' }} 
                  formatter={(value: number) => formatNumber(value)} 
                />
                <Area type="monotone" dataKey="requests" stroke="#4F46E5" fillOpacity={1} fill="url(#aiDaily)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Нет вызовов AI за выбранный период</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListCard
          title="Топ моделей"
          emptyText="Нет данных по моделям"
          items={usage.byModel.map((model) => ({
            label: model.model,
            value: `${model.requests} req / ${formatCurrency(model.cost)}`,
          }))}
        />
        <ListCard
          title="Контексты"
          emptyText="Нет данных по контекстам"
          items={usage.byContext.map((context) => ({
            label: context.context,
            value: `${context.requests} req`
          }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonitoringPanel
          title="Отслеживаемые пользователи"
          description="AI-анализ сообщений конкретных участников"
          emptyText="Нет вручную отслеживаемых пользователей"
          entries={snapshot.users}
          savingTarget={savingTarget}
          onToggleDetoxify={(id, value) => handleUserUpdate(id, { detoxifyEnabled: value })}
          onTogglePing={(id, value) => handleUserUpdate(id, { aiPingEnabled: value })}
          onDisable={(id) => handleUserUpdate(id, { isMonitored: false })}
        />

        <MonitoringPanel
          title="Отслеживаемые каналы"
          description="Каналы с включённым AI мониторингом"
          emptyText="Нет отслеживаемых каналов"
          entries={snapshot.channels.map((channel) => ({
            id: channel.id,
            username: channel.name,
            avatar: null,
            detoxifyEnabled: channel.detoxifyEnabled,
            aiPingEnabled: channel.aiPingEnabled,
          }))}
          savingTarget={savingTarget}
          onToggleDetoxify={(id, value) => handleChannelUpdate(id, { detoxifyEnabled: value })}
          onTogglePing={(id, value) => handleChannelUpdate(id, { aiPingEnabled: value })}
          onDisable={(id) => handleChannelUpdate(id, { enabled: false })}
        />
      </div>

      <div className="glass-panel p-6">
        <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Быстрый обзор настроек</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Подробная настройка доступна во вкладке Settings → AI Monitoring.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickSetting label="AI Enabled" value={snapshot.settings.aiEnabled ? 'On' : 'Off'} />
          <QuickSetting label="Threshold" value={`${snapshot.settings.aiThreshold}%`} />
          <QuickSetting label="Action" value={snapshot.settings.aiAction} />
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

const StatCard = ({ label, value, icon }: StatCardProps) => (
  <div className="glass-panel p-4 flex items-center gap-4">
    <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-lg">{icon}</div>
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-semibold text-gray-800 dark:text-white">{value}</p>
    </div>
  </div>
);

interface ListCardProps {
  title: string;
  emptyText: string;
  items: Array<{ label: string; value: string }>;
}

const ListCard = ({ title, emptyText, items }: ListCardProps) => (
  <div className="glass-panel p-6">
    <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
    {items.length === 0 ? (
      <p className="text-gray-400 text-sm">{emptyText}</p>
    ) : (
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.label} className="flex justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
            <span className="font-semibold text-gray-900 dark:text-white">{item.value}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

interface MonitoringPanelProps {
  title: string;
  description: string;
  emptyText: string;
  entries: Array<{
    id: string;
    username: string;
    avatar: string | null;
    detoxifyEnabled: boolean;
    aiPingEnabled: boolean;
  }>;
  savingTarget: string | null;
  onToggleDetoxify: (id: string, value: boolean) => void;
  onTogglePing: (id: string, value: boolean) => void;
  onDisable: (id: string) => void;
}

const MonitoringPanel = ({
  title,
  description,
  emptyText,
  entries,
  savingTarget,
  onToggleDetoxify,
  onTogglePing,
  onDisable,
}: MonitoringPanelProps) => (
  <div className="glass-panel p-6">
    <div className="mb-4">
      <h3 className="font-semibold text-gray-800 dark:text-white">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>

    {entries.length === 0 ? (
      <p className="text-gray-400 text-sm">{emptyText}</p>
    ) : (
      <ul className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-3 border border-gray-100 dark:border-white/10 rounded-lg p-4 bg-gray-50 dark:bg-white/5">
            <div className="flex items-center gap-3">
              {entry.avatar ? (
                <img src={entry.avatar} alt={entry.username} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-500 dark:text-gray-400">#</div>
              )}
              <div>
                <p className="font-medium text-gray-800 dark:text-white">{entry.username}</p>
                <p className="text-xs text-gray-400">ID: {entry.id}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <ToggleButton
                label="Detoxify"
                enabled={entry.detoxifyEnabled}
                onClick={() => onToggleDetoxify(entry.id, !entry.detoxifyEnabled)}
                loadingKey={savingTarget === `user-${entry.id}` || savingTarget === `channel-${entry.id}`}
              />
              <ToggleButton
                label="Ping"
                enabled={entry.aiPingEnabled}
                onClick={() => onTogglePing(entry.id, !entry.aiPingEnabled)}
                loadingKey={savingTarget === `user-${entry.id}` || savingTarget === `channel-${entry.id}`}
              />
              <button
                onClick={() => onDisable(entry.id)}
                className="px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Disable
              </button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);

interface ToggleButtonProps {
  label: string;
  enabled: boolean;
  onClick: () => void;
  loadingKey: boolean;
}

const ToggleButton = ({ label, enabled, onClick, loadingKey }: ToggleButtonProps) => (
  <button
    onClick={onClick}
    disabled={loadingKey}
    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
      enabled
        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30'
        : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10'
    } ${loadingKey ? 'opacity-60 cursor-wait' : ''}`}
  >
    {enabled ? 'On' : 'Off'} {label}
  </button>
);

const QuickSetting = ({ label, value }: { label: string; value: string }) => (
  <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-lg">
    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
    <p className="text-lg font-semibold text-gray-800 dark:text-white">{value}</p>
  </div>
);
