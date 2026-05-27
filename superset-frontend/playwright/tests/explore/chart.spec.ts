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
import { testWithAssets, expect } from '../../helpers/fixtures';
import { ChartListPage } from '../../pages/ChartListPage';
import { apiPostDashboard } from '../../helpers/api/dashboard';
import { apiPostChart, ChartCreatePayload } from '../../helpers/api/chart';
import { waitForGet } from '../../helpers/api/intercepts';
import { getDatasetByName } from '../../helpers/api/dataset';
import { TIMEOUT } from '../../utils/constants';
import type { TestAssets } from '../../helpers/fixtures';

/** Dashboard fixture matching the Cypress dashboards.json */
const DASHBOARD_FIXTURES = Array.from({ length: 11 }, (_, i) => ({
  dashboard_title: `${i + 1} - Sample dashboard`,
  slug: `${i + 1}-sample-dashboard`,
}));

/** Chart fixture matching the Cypress charts.json (index 0 only) */
const CHART_FIXTURE: Omit<ChartCreatePayload, 'datasource_id'> = {
  slice_name: '1 - Sample chart',
  datasource_type: 'table',
  viz_type: 'echarts_timeseries_line',
  params:
    '{"viz_type":"echarts_timeseries_line","x_axis":"year","metrics":["count"]}',
};

/**
 * Creates sample dashboards via API and tracks them for cleanup.
 * Mirrors Cypress `cy.createSampleDashboards()`.
 */
async function createSampleDashboards(
  page: Page,
  testAssets: TestAssets,
  indexes: number[],
): Promise<void> {
  for (const i of indexes) {
    const fixture = DASHBOARD_FIXTURES[i];
    const response = await apiPostDashboard(page, fixture);
    const body = await response.json();
    const id = body.result?.id ?? body.id;
    if (id) {
      testAssets.trackDashboard(id);
    }
  }
}

/**
 * Creates a sample chart via API and tracks it for cleanup.
 * Mirrors Cypress `cy.createSampleCharts([0])`.
 */
async function createSampleChart(
  page: Page,
  testAssets: TestAssets,
): Promise<void> {
  const dataset = await getDatasetByName(page, 'birth_names');
  if (!dataset) {
    throw new Error(
      'birth_names dataset not found — run Superset with --load-examples',
    );
  }

  const response = await apiPostChart(page, {
    ...CHART_FIXTURE,
    datasource_id: dataset.id,
  });
  const body = await response.json();
  const id = body.result?.id ?? body.id;
  if (id) {
    testAssets.trackChart(id);
  }
}

/** Opens the "On dashboards" submenu from the actions trigger dropdown. */
async function openDashboardsAddedTo(page: Page): Promise<void> {
  await page.getByTestId('actions-trigger').click();
  const submenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await submenuTitle.hover({ force: true });
  await page
    .locator('.ant-dropdown-menu-submenu-popup')
    .waitFor({ state: 'visible' });
}

/** Closes the "On dashboards" submenu. */
async function closeDashboardsAddedTo(page: Page): Promise<void> {
  const submenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await submenuTitle.dispatchEvent('mouseout');
  await page.getByTestId('actions-trigger').click();
}

/** Verifies a dashboard name appears in the submenu popup then closes it. */
async function verifyDashboardsSubmenuItem(
  page: Page,
  dashboardName: string,
): Promise<void> {
  const popup = page.locator('.ant-dropdown-menu-submenu-popup');
  await expect(popup.getByText(dashboardName)).toBeVisible();
  await closeDashboardsAddedTo(page);
}

/** Verifies search functionality in the dashboards submenu. */
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

/** Verifies clicking a dashboard link navigates to the dashboard page. */
async function verifyDashboardLink(page: Page): Promise<void> {
  const dashboardGetPromise = waitForGet(page, 'api/v1/dashboard/');
  await openDashboardsAddedTo(page);
  const popup = page.locator('.ant-dropdown-menu-submenu-popup');
  await popup.hover({ force: true });

  const link = popup.locator('a').first();
  // Remove target attribute to navigate in the same tab
  await link.evaluate(el => el.removeAttribute('target'));
  await link.click({ force: true });
  await dashboardGetPromise;
}

/**
 * Saves a chart to a dashboard via the save modal, then verifies
 * the metadata bar and "On dashboards" submenu are updated.
 */
async function saveChartToDashboard(
  page: Page,
  chartName: string,
  dashboardName: string,
): Promise<void> {
  const dashboardGetPromise = waitForGet(page, 'api/v1/dashboard/');

  const saveButton = page.getByTestId('query-save-button');
  await expect(saveButton).toBeEnabled();
  await saveButton.click({ force: true });

  const saveModal = page.getByTestId('save-modal-body');
  await expect(saveModal).toBeVisible();

  // Type the dashboard name in the select input
  const selectInput = saveModal.locator(
    '.ant-select-selection-search-input[aria-label*="Select a dashboard"]',
  );
  await selectInput.fill(dashboardName, { force: true });

  // Click the matching option
  const option = page.locator(
    `.ant-select-item-option[title="${dashboardName}"]`,
  );
  await option.click();

  // Click Save and wait for update
  const updatePromise = page.waitForResponse(
    response =>
      response.url().includes('api/v1/chart/') &&
      response.request().method() === 'PUT',
  );
  await page.getByTestId('btn-modal-save').click();
  await updatePromise;

  // Wait for modal to close
  await expect(saveModal).not.toBeVisible();

  // Wait for the save button to become disabled then re-enabled
  await expect(saveButton).toBeDisabled();
  await dashboardGetPromise;

  // Wait for explore page to reload
  await page.waitForResponse(
    response =>
      /\/api\/v1\/explore\/\?(form_data_key|dashboard_page_id|slice_id)=/.test(
        response.url(),
      ) && response.request().method() === 'GET',
  );

  // Verify success toast messages
  await expect(
    page.getByText(`was added to dashboard [${dashboardName}]`),
  ).toBeVisible();
  await expect(
    page.getByText(`Chart [${chartName}] has been overwritten`),
  ).toBeVisible();

  await expect(saveButton).toBeEnabled();
}

/** Verifies metadata bar text. */
async function verifyMetabar(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId('metadata-bar').getByText(text)).toBeVisible();
}

/**
 * Saves chart to a numbered dashboard, then verifies metadata bar
 * and submenu item.
 */
async function saveAndVerifyDashboard(
  page: Page,
  chartName: string,
  number: number,
): Promise<void> {
  const dashboardName = `${number} - Sample dashboard`;
  await saveChartToDashboard(page, chartName, dashboardName);

  const expectedText =
    number > 1 ? `Added to ${number} dashboards` : 'Added to 1 dashboard';
  await verifyMetabar(page, expectedText);

  await openDashboardsAddedTo(page);
  await verifyDashboardsSubmenuItem(page, dashboardName);
}

const SAMPLE_DASHBOARDS_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Extend testWithAssets with chart list page navigation.
 */
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
  chartListPage,
  testAssets,
}) => {
  // This test saves a chart to 11 dashboards sequentially
  test.setTimeout(TIMEOUT.SLOW_TEST * 5);

  // Create sample dashboards and chart via API
  await createSampleDashboards(page, testAssets, SAMPLE_DASHBOARDS_INDEXES);
  await createSampleChart(page, testAssets);

  // Refresh the chart list to see the new chart
  await chartListPage.goto();
  await chartListPage.waitForTableLoad();

  // Click on the sample chart to open it in Explore
  await chartListPage.getChartRow('1 - Sample chart').click();
  await page.waitForURL('**/explore/**', { timeout: TIMEOUT.PAGE_LOAD });

  // Verify initial state: not added to any dashboard
  await verifyMetabar(page, 'Not added to any dashboard');
  await openDashboardsAddedTo(page);
  await verifyDashboardsSubmenuItem(page, 'None');

  // Save chart to dashboards 1 through 11
  for (let i = 1; i <= 11; i++) {
    await saveAndVerifyDashboard(page, '1 - Sample chart', i);
  }

  // Verify dashboard search functionality
  await verifyDashboardSearch(page);

  // Verify clicking a dashboard link navigates to the dashboard
  await verifyDashboardLink(page);
});

// Skip: Uses hardcoded datasource ID that may not exist after example loading changes
test.skip('No results message shows up', async ({ page }) => {
  const formData = {
    datasource: '2__table',
    metrics: [
      {
        expressionType: 'SIMPLE',
        column: { column_name: 'count', type: 'BIGINT' },
        aggregate: 'COUNT',
        label: 'COUNT(count)',
      },
    ],
    viz_type: 'echarts_timeseries_line',
    adhoc_filters: [
      {
        expressionType: 'SIMPLE',
        subject: 'state',
        operator: 'IN',
        comparator: ['Fake State'],
        clause: 'WHERE',
        sqlExpression: null,
      },
    ],
  };

  const encodedFormData = encodeURIComponent(JSON.stringify(formData));
  const chartDataPromise = page.waitForResponse(
    response =>
      response.url().includes('api/v1/chart/data') && response.status() === 200,
  );
  await page.goto(`explore/?form_data=${encodedFormData}`);
  await chartDataPromise;

  await expect(
    page
      .locator('div.chart-container')
      .getByText('No results were returned for this query'),
  ).toBeVisible();
});
