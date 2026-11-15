// Synthetic documentation data only. No real hosts, chats, credentials or model calls.
const idle = { type: 'idle' };
const project = (id, name, path) => ({ id, name, path });
const chat = (id, name, host, projectId, projectName, cwd, updatedAt, status = idle) => ({
  id,
  name,
  host,
  projectId,
  projectName,
  cwd,
  updatedAt,
  status,
});

export const catalog = {
  cached: false,
  hosts: [
    {
      id: 'mac',
      name: '演示 Mac',
      online: true,
      projects: [
        project('website', '个人网站', '/workspace/website'),
        project('toolkit', '开发工具', '/workspace/toolkit'),
      ],
      threads: [
        chat(
          'demo-homepage-chat',
          '完成首页的移动端适配',
          'mac',
          'website',
          '个人网站',
          '/workspace/website',
          6,
        ),
        chat(
          'demo-navigation-chat',
          '整理导航和页面结构',
          'mac',
          'website',
          '个人网站',
          '/workspace/website',
          4,
        ),
        chat(
          'demo-release-chat',
          '准备下一版发布说明',
          'mac',
          'toolkit',
          '开发工具',
          '/workspace/toolkit',
          2,
        ),
      ],
    },
    {
      id: 'devbox',
      name: '开发服务器',
      online: true,
      projects: [project('service', 'API 服务', '/workspace/service')],
      threads: [
        chat(
          'demo-tests-chat',
          '排查接口测试失败',
          'devbox',
          'service',
          'API 服务',
          '/workspace/service',
          5,
          { type: 'active' },
        ),
        chat(
          'demo-cache-chat',
          '优化目录缓存',
          'devbox',
          'service',
          'API 服务',
          '/workspace/service',
          3,
        ),
      ],
    },
  ],
};

export const modelSettings = {
  models: [
    {
      model: 'demo-model',
      name: '示例模型',
      efforts: ['low', 'medium', 'high'],
      defaultEffort: 'medium',
    },
  ],
  settings: { model: 'demo-model', effort: 'high', readable: true },
  pending: false,
};

export function snapshot(host, id) {
  const thread = catalog.hosts
    .find((device) => device.id === host)
    ?.threads.find((item) => item.id === id);
  if (!thread) return null;
  return {
    host,
    thread,
    nextCursor: null,
    pending: [],
    queue: [],
    turns: [
      {
        id: 'demo-completed-turn',
        status: 'completed',
        error: null,
        items: [
          {
            id: 'demo-user-message',
            type: 'userMessage',
            content: [{ type: 'text', text: '帮我检查首页在手机上的显示，并整理需要修改的地方。' }],
          },
          {
            id: 'demo-command',
            type: 'commandExecution',
            command: 'npm test',
            status: 'completed',
            aggregatedOutput: 'Demo fixture: all checks passed.',
          },
          {
            id: 'demo-assistant-message',
            type: 'agentMessage',
            text: '### 已完成移动端适配\n\n导航、内容和按钮已按小屏幕重新排布。\n\n| 检查项 | 结果 |\n| --- | --- |\n| 页面布局 | 通过 |\n| 导航交互 | 通过 |\n| 基础测试 | 通过 |\n\n下一步可以在同一个原会话里继续调整。',
          },
        ],
      },
    ],
  };
}
