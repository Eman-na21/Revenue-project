import { Agent, Category, Collection, normalizeCategory } from '@/types';

/**
 * This is the SAME Excel report the administrator downloads (Name of Agents, Chat / Royalty /
 * Other Revenue / Total with Plan, Performance, % and Rank, plus the Forest vs Sand table).
 * It is kept in its own file so agents can download exactly the same report.
 */

const normalizeId = (value: unknown): string => String(value ?? '').trim();

const sameAgentId = (left: unknown, right: unknown): boolean => {
  const a = normalizeId(left);
  const b = normalizeId(right);
  return a !== '' && b !== '' && a === b;
};

export function downloadAllAgentsExcel(
  agents: Agent[],
  collections: Collection[],
  rangeStart: string,
  rangeEnd: string,
) {
  const cleanDate = (value: unknown) =>
    String(value ?? '').trim().split('T')[0].slice(0, 10);

  const escapeCell = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const money = (value: number) => Math.round(Number(value) || 0);
  const percentValue = (actual: number, plan: number) =>
    plan > 0 ? (actual / plan) * 100 : 0;
  const percent = (actual: number, plan: number) =>
    plan > 0 ? `${Math.round(percentValue(actual, plan))}%` : '—';

  const startDate = new Date(`${rangeStart}T00:00:00`);
  const endDate = new Date(`${rangeEnd}T00:00:00`);
  const dayCount =
    Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())
      ? 0
      : Math.max(
          1,
          Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
        );

  // Only collections inside the selected From/To dates are included.
  const filtered = collections.filter((row) => {
    const date = cleanDate(row.date);
    return date >= rangeStart && date <= rangeEnd;
  });

  const categoryTotal = (agent: Agent, category: Category) =>
    filtered
      .filter(
        (row) =>
          sameAgentId(row.agentId, agent.id) &&
          normalizeCategory(row.category) === category,
      )
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const reportRows = agents.map((agent) => {
    const chat = categoryTotal(agent, 'Chat');
    const royalty = categoryTotal(agent, 'Royalty');
    const other = categoryTotal(agent, 'Other Revenue');
    const totalActual = chat + royalty + other;

    // Plan comes from the agent's configured DAILY TARGET.
    // Total Plan = daily target × number of selected days.
    const dailyPlan = money(Number(agent.daily) || 0);
    const totalPlan = money(dailyPlan * dayCount);

    return {
      agent,
      dailyPlan,
      chat,
      royalty,
      other,
      totalActual,
      totalPlan,
      chatPercent: percentValue(chat, dailyPlan),
      royaltyPercent: percentValue(royalty, dailyPlan),
      otherPercent: percentValue(other, dailyPlan),
      totalPercentValue: percentValue(totalActual, totalPlan),
      chatDisplay: percent(chat, dailyPlan),
      royaltyDisplay: percent(royalty, dailyPlan),
      otherDisplay: percent(other, dailyPlan),
      totalDisplay: percent(totalActual, totalPlan),
    };
  });

  
  const createRankMap = (
    percentageKey:
      | 'chatPercent'
      | 'royaltyPercent'
      | 'otherPercent'
      | 'totalPercentValue',
    amountKey: 'chat' | 'royalty' | 'other' | 'totalActual',
  ) => {
    const ranked = [...reportRows].sort(
      (a, b) =>
        b[percentageKey] - a[percentageKey] ||
        b[amountKey] - a[amountKey] ||
        a.agent.name.localeCompare(b.agent.name),
    );

    const rankMap = new Map<string, number>();
    ranked.forEach((row, index) => {
      rankMap.set(normalizeId(row.agent.id), index + 1);
    });
    return rankMap;
  };

  const chatRankMap = createRankMap('chatPercent', 'chat');
  const royaltyRankMap = createRankMap('royaltyPercent', 'royalty');
  const otherRankMap = createRankMap('otherPercent', 'other');
  const totalRankMap = createRankMap('totalPercentValue', 'totalActual');

  const bodyRows = reportRows
    .map(
      (row) => `
      <tr>
        <td class="agent">${escapeCell(row.agent.name)}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.chat)}</td>
        <td class="number">${row.chatDisplay}</td>
        <td class="rank">${chatRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.royalty)}</td>
        <td class="number">${row.royaltyDisplay}</td>
        <td class="rank">${royaltyRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>

        <td class="number">${money(row.dailyPlan)}</td>
        <td class="number">${money(row.other)}</td>
        <td class="number">${row.otherDisplay}</td>
        <td class="rank">${otherRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>

        <td class="number">${money(row.totalPlan)}</td>
        <td class="number">${money(row.totalActual)}</td>
        <td class="number">${row.totalDisplay}</td>
        <td class="rank">${totalRankMap.get(normalizeId(row.agent.id)) ?? '—'}</td>
      </tr>
    `,
    )
    .join('');

  const totalDailyPlan = reportRows.reduce(
    (sum, row) => sum + row.dailyPlan,
    0,
  );
  const totalPlan = reportRows.reduce((sum, row) => sum + row.totalPlan, 0);
  const totalChat = reportRows.reduce((sum, row) => sum + row.chat, 0);
  const totalRoyalty = reportRows.reduce(
    (sum, row) => sum + row.royalty,
    0,
  );
  const totalOther = reportRows.reduce((sum, row) => sum + row.other, 0);
  const grandTotal = totalChat + totalRoyalty + totalOther;

  // Royalty split: Forest vs Sand (old records without a type go to "Not specified")
  const royaltyOf = (agent: Agent, type: 'forest' | 'sand' | 'unspecified') =>
    filtered
      .filter(
        (row) =>
          sameAgentId(row.agentId, agent.id) &&
          normalizeCategory(row.category) === 'Royalty' &&
          (type === 'unspecified' ? !row.royaltyType : row.royaltyType === type),
      )
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const royaltyRows = agents.map((agent) => {
    const forest = royaltyOf(agent, 'forest');
    const sand = royaltyOf(agent, 'sand');
    const unspecified = royaltyOf(agent, 'unspecified');
    return { name: agent.name, forest, sand, unspecified, total: forest + sand + unspecified };
  });
  const showUnspecified = royaltyRows.some((row) => row.unspecified > 0);
  const royaltyBody = royaltyRows
    .map(
      (row) => `
      <tr>
        <td class="agent">${escapeCell(row.name)}</td>
        <td class="number">${money(row.forest)}</td>
        <td class="number">${money(row.sand)}</td>
        ${showUnspecified ? `<td class="number">${money(row.unspecified)}</td>` : ''}
        <td class="number">${money(row.total)}</td>
      </tr>`,
    )
    .join('');
  const royaltySum = (key: 'forest' | 'sand' | 'unspecified' | 'total') =>
    money(royaltyRows.reduce((sum, row) => sum + row[key], 0));

 
  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Calibri, Arial, sans-serif;
            color: #000000;
            margin: 18px;
          }

          .title {
            font-size: 16pt;
            font-weight: bold;
            text-align: center;
            padding: 4px;
          }

          .subtitle {
            font-size: 14pt;
            font-weight: bold;
            text-align: center;
            padding: 4px;
          }

          .period {
            font-size: 12pt;
            text-align: center;
            padding: 4px 4px 12px;
          }

          table {
            border-collapse: collapse;
            width: 100%;
            min-width: 1500px;
            font-family: Calibri, Arial, sans-serif;
          }

          th, td {
            border: 1px solid #000000;
            padding: 7px 8px;
            white-space: nowrap;
            font-size: 11pt;
          }

          th {
            background: #D3D3D3;
            color: #000000;
            font-weight: bold;
            text-align: center;
            vertical-align: middle;
          }

          .group {
            background: #D3D3D3;
            font-weight: bold;
            text-align: center;
          }

          .subhead {
            background: #D3D3D3;
            font-weight: bold;
            text-align: center;
          }

          .agent {
            text-align: left;
          }

          .number {
            text-align: right;
          }

          .rank {
            text-align: center;
            font-weight: bold;
          }

          .total td {
            font-weight: bold;
            background: #FFFFFF;
          }

          .footer {
            margin-top: 12px;
            font-size: 11pt;
            text-align: left;
          }
        </style>
      </head>

      <body>
        <div class="title">Kalu Revenue Collection Office</div>
        <div class="subtitle">Agent Collection Performance Report</div>
        <div class="period">
          Selected Date: ${escapeCell(rangeStart)} to ${escapeCell(rangeEnd)}
          &nbsp; | &nbsp; ${dayCount} day${dayCount === 1 ? '' : 's'}
        </div>

        <table>
          <thead>
            <tr>
              <th rowspan="2">Name of Agents</th>
              <th class="group" colspan="4">Chat</th>
              <th class="group" colspan="4">Royalty</th>
              <th class="group" colspan="4">Other Revenue</th>
              <th class="group" colspan="4">Total</th>
            </tr>
            <tr>
              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>

              <th class="subhead">Plan</th>
              <th class="subhead">Performance</th>
              <th class="subhead">%</th>
              <th class="subhead">Rank</th>
            </tr>
          </thead>

          <tbody>
            ${
              bodyRows ||
              `<tr><td colspan="17">No agents found.</td></tr>`
            }

            <tr class="total">
              <td>TOTAL</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalChat)}</td>
              <td class="number">${percent(totalChat, totalDailyPlan)}</td>
              <td class="rank">—</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalRoyalty)}</td>
              <td class="number">${percent(totalRoyalty, totalDailyPlan)}</td>
              <td class="rank">—</td>

              <td class="number">${money(totalDailyPlan)}</td>
              <td class="number">${money(totalOther)}</td>
              <td class="number">${percent(totalOther, totalDailyPlan)}</td>
              <td class="rank">—</td>

              <td class="number">${money(totalPlan)}</td>
              <td class="number">${money(grandTotal)}</td>
              <td class="number">${percent(grandTotal, totalPlan)}</td>
              <td class="rank">—</td>
            </tr>
          </tbody>
        </table>

        <div class="subtitle" style="margin-top:28px">Royalty Breakdown: Forest vs Sand</div>
        <table style="min-width:520px; width:auto;">
          <thead>
            <tr>
              <th>Name of Agents</th>
              <th>Forest Royalty</th>
              <th>Sand Royalty</th>
              ${showUnspecified ? '<th>Royalty (not specified)</th>' : ''}
              <th>Total Royalty</th>
            </tr>
          </thead>
          <tbody>
            ${royaltyBody || '<tr><td colspan="5">No agents found.</td></tr>'}
            <tr class="total">
              <td>TOTAL</td>
              <td class="number">${royaltySum('forest')}</td>
              <td class="number">${royaltySum('sand')}</td>
              ${showUnspecified ? `<td class="number">${royaltySum('unspecified')}</td>` : ''}
              <td class="number">${royaltySum('total')}</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob(
    [`\ufeff${html}`],
    { type: 'application/vnd.ms-excel;charset=utf-8' },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `revenue-performance-${rangeStart}-to-${rangeEnd}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
