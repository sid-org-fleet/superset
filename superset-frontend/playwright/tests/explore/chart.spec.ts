/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Page } from '@playwright/test';
import { testWithAssets, expect, TestAssets } from '../../helpers/fixtures';
import { ChartListPage } from '../../pages/ChartListPage';
import {
  apiPostDashboard,
  DashboardCreatePayload,
} from '../../helpers/api/dashboard';
import { apiPostChart } from '../../helpers/api/chart';
import { waitForGet, waitForPut } from '../../helpers/api/intercepts';
import { TIMEOUT } from '../../utils/constants';

const SAMPLE_DASHBOARDS_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface SampleDashboard {
  id: number;
  title: string;
}

interface SampleChart {
  id: number;
  name: string;
}

/**
 * Create sample dashboards via API, matching the Cypress fixture pattern.
 */
async function createSampleDashboards(
  page: Page,
  testAssets: TestAssets,
  indexes: number[],
): Promise<SampleDashboard[]> {
  const dashboards: SampleDashboard[] = [];
  for (const i of indexes) {
    const title = `${i + 1} - Sample dashboard`;
    const payload: DashboardCreatePayload = {
      dashboard_title: title,
      slug: `${i + 1}-sample-dashboard`,
    };
    const response = await apiPostDashboard(page, payload);
    const body = await response.json();
    const id = body.result?.id ?? body.id;
    testAssets.trackDashboard(id);
    dashboards.push({ id, title });
  }
  return dashboards;
}

/**
 * Create a sample chart via API, matching the Cypress fixture pattern.
 * Uses datasource_id: 2 and datasource_type: "table" like the Cypress fixture.
 */
async function createSampleChart(
  page: Page,
  testAssets: TestAssets,
): Promise<SampleChart> {
  const response = await apiPostChart(page, {
    slice_name: '1 - Sample chart',
    datasource_id: 2,
    datasource_type: 'table',
    viz_type: 'echarts_timeseries_line',
    params:
      '{"viz_type":"echarts_timeseries_line","x_axis":"year","metrics":["count"]}',
  });
  const body = await response.json();
  const id = body.result?.id ?? body.id;
  testAssets.trackChart(id);
  return { id, name: '1 - Sample chart' };
}

/**
 * Open the "On dashboards" submenu from the actions trigger button.
 */
async function openDashboardsAddedTo(page: Page): Promise<void> {
  const actionsTrigger = page.getByTestId('actions-trigger');
  await expect(actionsTrigger).toBeVisible();
  await actionsTrigger.click();

  const submenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await submenuTitle.hover({ force: true });

  await page
    .locator('.ant-dropdown-menu-submenu-popup')
    .waitFor({ state: 'visible' });
}

/**
 * Close the "On dashboards" submenu by moving focus away and closing the dropdown.
 */
async function closeDashboardsAddedTo(page: Page): Promise<void> {
  const submenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await submenuTitle.dispatchEvent('mouseout');

  const actionsTrigger = page.getByTestId('actions-trigger');
  await actionsTrigger.click();
}

/**
 * Verify a dashboard name appears in the submenu popup, then close it.
 */
async function verifyDashboardsSubmenuItem(
  page: Page,
  dashboardName: string,
): Promise<void> {
  const popup = page.locator('.ant-dropdown-menu-submenu-popup');
  await expect(popup.getByText(dashboardName)).toBeVisible();
  await closeDashboardsAddedTo(page);
}

/**
 * Verify the metadata bar contains specific text.
 */
async function verifyMetabar(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId('metadata-bar')).toContainText(text);
}

/**
 * Save the chart to a dashboard and verify the metadata bar + submenu update.
 */
async function saveAndVerifyDashboard(
  page: Page,
  chartName: string,
  number: string,
): Promise<void> {
  await saveChartToDashboard(page, chartName, `${number} - Sample dashboard`);
  const num = parseInt(number, 10);
  await verifyMetabar(
    page,
    num > 1 ? `Added to ${num} dashboards` : 'Added to 1 dashboard',
  );
  await openDashboardsAddedTo(page);
  await verifyDashboardsSubmenuItem(page, `${number} - Sample dashboard`);
}

/**
 * Save a chart to a dashboard via the save modal.
 * Playwright equivalent of the Cypress saveChartToDashboard helper.
 */
async function saveChartToDashboard(
  page: Page,
  chartName: string,
  dashboardName: string,
): Promise<void> {
  const saveButton = page.getByTestId('query-save-button');
  await expect(saveButton).toBeEnabled();
  await saveButton.click({ force: true });

  const saveModal = page.getByTestId('save-modal-body');
  await expect(saveModal).toBeVisible();

  const dashboardInput = saveModal.locator(
    '.ant-select-selection-search-input[aria-label*="Select a dashboard"]',
  );
  await dashboardInput.fill(dashboardName);

  const option = saveModal.locator(
    `.ant-select-item-option[title="${dashboardName}"]`,
  );
  await option.click();

  const updateResponsePromise = waitForPut(page, 'api/v1/chart/');

  await page.getByTestId('btn-modal-save').click();

  await updateResponsePromise;

  await expect(saveModal).not.toBeVisible();
  await expect(saveButton).toBeDisabled();

  await waitForGet(page, 'api/v1/dashboard/');
  await waitForGet(page, /\/api\/v1\/explore\/\?(form_data_key|dashboard_page_id|slice_id)=/);

  await expect(
    page.getByText(`was added to dashboard [${dashboardName}]`),
  ).toBeVisible();
  await expect(
    page.getByText(`Chart [${chartName}] has been overwritten`),
  ).toBeVisible();
  await expect(saveButton).toBeEnabled();
}

/**
 * Verify the dashboard search within the "On dashboards" submenu popup.
 */
async function verifyDashboardSearch(page: Page): Promise<void> {
  await openDashboardsAddedTo(page);
  const popup = page.locator('.ant-dropdown-menu-submenu-popup');
  await popup.hover();

  const searchInput = popup.locator('input[placeholder="Search"]');
  await searchInput.fill('1');
  await expect(popup.getByText('1 - Sample dashboard')).toBeVisible();

  await searchInput.fill('1Blahblah');
  await expect(popup.getByText('No results found')).toBeVisible();

  await popup.locator('[aria-label="close-circle"]').click();
  await closeDashboardsAddedTo(page);
}

/**
 * Verify clicking a dashboard link in the submenu navigates to the dashboard.
 */
async function verifyDashboardLink(page: Page): Promise<void> {
  await openDashboardsAddedTo(page);
  const popup = page.locator('.ant-dropdown-menu-submenu-popup');
  await popup.hover({ force: true });

  const link = popup.locator('a').first();

  const dashboardResponsePromise = waitForGet(
    page,
    'api/v1/dashboard/',
    { timeout: TIMEOUT.PAGE_LOAD },
  );

  // Remove target="_blank" to navigate in the same tab
  await link.evaluate(el => el.removeAttribute('target'));
  await link.click({ force: true });

  await dashboardResponsePromise;
}

const test = testWithAssets.extend<{ chartListPage: ChartListPage }>({
  chartListPage: async ({ page }, use) => {
    const chartListPage = new ChartListPage(page);
    await chartListPage.goto();
    await chartListPage.waitForTableLoad();
    await use(chartListPage);
  },
});

test('should show the cross-referenced dashboards', async ({
  page,
  testAssets,
}) => {
  test.setTimeout(TIMEOUT.SLOW_TEST * 4);

  // Setup: create sample dashboards and chart via API
  await createSampleDashboards(page, testAssets, SAMPLE_DASHBOARDS_INDEXES);
  await createSampleChart(page, testAssets);

  // Navigate to chart list and wait for it to load
  const chartListPage = new ChartListPage(page);
  await chartListPage.goto();
  await chartListPage.waitForTableLoad();

  // Click on the sample chart to open explore view
  await page.getByTestId('table-row').getByText('1 - Sample chart').click();

  // Verify initial state: not added to any dashboard
  await expect(page.getByTestId('metadata-bar')).toContainText(
    'Not added to any dashboard',
  );
  await openDashboardsAddedTo(page);
  await verifyDashboardsSubmenuItem(page, 'None');

  // Save chart to dashboards 1 through 11 and verify each
  for (let i = 1; i <= 11; i++) {
    await saveAndVerifyDashboard(page, '1 - Sample chart', String(i));
  }

  // Verify search functionality
  await verifyDashboardSearch(page);

  // Verify dashboard link navigation
  await verifyDashboardLink(page);
});

// Skip: Uses hardcoded datasource ID that may not exist after example loading changes
test.skip('No results message shows up', async ({ page }) => {
  const formData = {
    datasource: '3__table',
    time_grain_sqla: null,
    x_axis: 'ds',
    adhoc_filters: [
      {
        clause: 'WHERE',
        subject: 'ds',
        operator: 'TEMPORAL_RANGE',
        comparator: '100 years ago : now',
        expressionType: 'SIMPLE',
      },
      {
        expressionType: 'SIMPLE',
        subject: 'state',
        operator: 'IN',
        comparator: ['Fake State'],
        clause: 'WHERE',
        sqlExpression: null,
      },
    ],
    groupby: [],
    limit: null,
    timeseries_limit_metric: null,
    order_desc: false,
    contributionMode: null,
    metrics: [
      {
        expressionType: 'SIMPLE',
        column: {
          id: 336,
          column_name: 'num',
          verbose_name: null,
          description: null,
          expression: '',
          filterable: false,
          groupby: false,
          is_dttm: false,
          type: 'BIGINT',
          database_expression: null,
          python_date_format: null,
          optionName: '_col_num',
        },
        aggregate: 'SUM',
        sqlExpression: null,
        hasCustomLabel: false,
        label: 'Sum(num)',
        optionName: 'metric_1de0s4viy5d_ly7y8k6ghvk',
      },
    ],
    viz_type: 'echarts_timeseries_line',
  };

  const encodedFormData = encodeURIComponent(JSON.stringify(formData));
  const chartDataPromise = page.waitForResponse(
    response =>
      response.url().includes('/api/v1/chart/data') &&
      response.request().method() === 'POST',
  );

  await page.goto(`explore/?form_data=${encodedFormData}`);

  const chartDataResponse = await chartDataPromise;
  expect(chartDataResponse.status()).toBe(200);

  await expect(
    page.locator('div.chart-container').getByText(
      'No results were returned for this query',
    ),
  ).toBeVisible();
});
