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

import { testWithAssets, expect } from '../../helpers/fixtures';
import { ChartListPage } from '../../pages/ChartListPage';
import { apiPostDashboard } from '../../helpers/api/dashboard';
import { apiPostChart, ENDPOINTS } from '../../helpers/api/chart';
import { getDatasetByName } from '../../helpers/api/dataset';
import { waitForGet, waitForPut } from '../../helpers/api/intercepts';
import { TIMEOUT } from '../../utils/constants';

const SAMPLE_DASHBOARDS_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const test = testWithAssets;

test('should show the cross-referenced dashboards', async ({
  page,
  testAssets,
}) => {
  test.setTimeout(TIMEOUT.SLOW_TEST * 4);

  // Create 11 sample dashboards via API
  for (const idx of SAMPLE_DASHBOARDS_INDEXES) {
    const dashRes = await apiPostDashboard(page, {
      dashboard_title: `${idx} - Sample dashboard`,
    });
    const dashBody = await dashRes.json();
    const dashId = dashBody.result?.id ?? dashBody.id;
    testAssets.trackDashboard(dashId);
  }

  // Create a sample chart via API
  const dataset = await getDatasetByName(page, 'members_channels_2');
  if (!dataset) {
    throw new Error(
      'members_channels_2 dataset not found — run Superset with --load-examples',
    );
  }
  const chartRes = await apiPostChart(page, {
    slice_name: '1 - Sample chart',
    datasource_id: dataset.id,
    datasource_type: 'table',
    viz_type: 'table',
    params: '{}',
  });
  const chartBody = await chartRes.json();
  const chartId = chartBody.result?.id ?? chartBody.id;
  testAssets.trackChart(chartId);

  // Navigate to chart list and wait for it to load
  const chartListPage = new ChartListPage(page);
  const filteringPromise = waitForGet(page, 'api/v1/chart/?q=');
  await chartListPage.goto();
  await filteringPromise;
  await chartListPage.waitForTableLoad();

  // Click the sample chart from the list to open Explore view
  await chartListPage.getChartRow('1 - Sample chart').click();
  await page.waitForURL('**/explore/**');

  // Verify metadata bar says "Not added to any dashboard"
  const metadataBar = page.locator('[data-test="metadata-bar"]');
  await expect(metadataBar).toContainText('Not added to any dashboard');

  // Open the "On dashboards" submenu
  await page.locator('[data-test="actions-trigger"]').click();
  await page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' })
    .hover({ force: true });

  // Verify submenu shows "None"
  const submenuPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await expect(submenuPopup).toContainText('None');

  // Close the submenu
  await page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' })
    .dispatchEvent('mouseout');
  await page.locator('[data-test="actions-trigger"]').click();

  // Save chart to dashboards 1 through 11, verifying after each
  for (let number = 1; number <= 11; number++) {
    await saveChartToDashboard(page, '1 - Sample chart', number);
  }

  // Verify dashboard search functionality
  await verifyDashboardSearch(page);

  // Verify clicking a dashboard link navigates to the dashboard
  await verifyDashboardLink(page);
});

// Skip: Uses hardcoded datasource ID that may not exist after example loading changes
test.skip('No results message shows up', async ({ page }) => {
  const formData = {
    datasource: '3__table',
    time_grain_sqla: null,
    x_axis: 'ds',
    metrics: [
      {
        expressionType: 'SIMPLE',
        column: { column_name: 'num', type: 'BIGINT' },
        aggregate: 'SUM',
        label: 'SUM(num)',
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

  const v1DataPromise = page.waitForResponse(
    response =>
      response.url().includes('api/v1/chart/data') &&
      response.request().method() === 'POST',
  );

  const params = encodeURIComponent(JSON.stringify(formData));
  await page.goto(`explore/?form_data_key=&slice_id=&datasource=${formData.datasource}&form_data=${params}`);

  const v1DataResponse = await v1DataPromise;
  expect(v1DataResponse.status()).toBe(200);

  await expect(
    page.locator('div.chart-container').filter({ hasText: 'No results were returned for this query' }),
  ).toBeVisible();
});

/**
 * Save a chart to a numbered sample dashboard and verify the result.
 */
async function saveChartToDashboard(
  page: import('@playwright/test').Page,
  chartName: string,
  number: number,
): Promise<void> {
  const dashboardName = `${number} - Sample dashboard`;

  // Set up response intercepts before triggering the save
  const dashboardGetPromise = waitForGet(page, 'api/v1/dashboard/*');
  const updatePromise = waitForPut(page, 'api/v1/chart/');
  const exploreGetPromise = waitForGet(
    page,
    /.*\/api\/v1\/explore\/\?(form_data_key|dashboard_page_id|slice_id)=.*/,
  );

  // Click the save button
  const saveButton = page.locator('[data-test="query-save-button"]');
  await expect(saveButton).toBeEnabled();
  await saveButton.click({ force: true });

  // Wait for modal to appear
  const saveModal = page.locator('[data-test="save-modal-body"]');
  await expect(saveModal).toBeVisible();

  // Type the dashboard name into the dashboard select input
  const dashboardSelect = saveModal.locator(
    '.ant-select-selection-search-input[aria-label*="Select a dashboard"]',
  );
  await dashboardSelect.fill(dashboardName, { force: true });

  // Select the dashboard from the dropdown
  await page
    .locator(`.ant-select-item-option[title="${dashboardName}"]`)
    .click();

  // Click the save button in the modal
  await page.locator('[data-test="btn-modal-save"]').click();

  // Wait for the chart update
  await updatePromise;

  // Wait for the modal to close
  await expect(saveModal).not.toBeVisible();

  // Wait for the save button to become disabled then enabled again
  await expect(saveButton).toBeDisabled();
  await dashboardGetPromise;
  await exploreGetPromise;

  // Verify toast messages
  await expect(
    page.getByText(`was added to dashboard [${dashboardName}]`),
  ).toBeVisible();
  await expect(
    page.getByText(`Chart [${chartName}] has been overwritten`),
  ).toBeVisible();

  await expect(saveButton).toBeEnabled();

  // Verify metadata bar
  const metadataBar = page.locator('[data-test="metadata-bar"]');
  const expectedText =
    number > 1 ? `Added to ${number} dashboards` : 'Added to 1 dashboard';
  await expect(metadataBar).toContainText(expectedText);

  // Open the "On dashboards" submenu and verify it contains the dashboard
  await openDashboardsAddedTo(page);
  await verifyDashboardsSubmenuItem(page, dashboardName);
}

async function openDashboardsAddedTo(
  page: import('@playwright/test').Page,
): Promise<void> {
  await expect(
    page.locator('[data-test="actions-trigger"]'),
  ).toBeVisible();
  await page.locator('[data-test="actions-trigger"]').click();
  await page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' })
    .hover({ force: true });
}

async function closeDashboardsAddedTo(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' })
    .dispatchEvent('mouseout');
  await page.locator('[data-test="actions-trigger"]').click();
}

async function verifyDashboardsSubmenuItem(
  page: import('@playwright/test').Page,
  dashboardName: string,
): Promise<void> {
  const submenuPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await expect(submenuPopup).toContainText(dashboardName);
  await closeDashboardsAddedTo(page);
}

async function verifyDashboardSearch(
  page: import('@playwright/test').Page,
): Promise<void> {
  await openDashboardsAddedTo(page);
  const submenuPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await submenuPopup.hover();

  // Type "1" in search
  const searchInput = submenuPopup.locator('input[placeholder="Search"]');
  await searchInput.fill('1');
  await expect(submenuPopup).toContainText('1 - Sample dashboard');

  // Type garbage to get "No results found"
  await searchInput.fill('1Blahblah');
  await expect(submenuPopup).toContainText('No results found');

  // Clear the search
  await submenuPopup.locator('[aria-label="close-circle"]').click();

  await closeDashboardsAddedTo(page);
}

async function verifyDashboardLink(
  page: import('@playwright/test').Page,
): Promise<void> {
  const dashboardGetPromise = waitForGet(page, 'api/v1/dashboard/*');

  await openDashboardsAddedTo(page);
  const submenuPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await submenuPopup.hover({ force: true });

  // Remove target attribute and click the first dashboard link
  const firstLink = submenuPopup.locator('a').first();
  await firstLink.evaluate(el => el.removeAttribute('target'));
  await firstLink.click({ force: true });

  await dashboardGetPromise;
}
