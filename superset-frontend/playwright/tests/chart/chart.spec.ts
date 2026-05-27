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
import { apiPostDashboard } from '../../helpers/api/dashboard';
import { apiPostChart } from '../../helpers/api/chart';
import { getDatasetByName } from '../../helpers/api/dataset';
import { waitForGet, waitForPut } from '../../helpers/api/intercepts';
import { URL } from '../../utils/urls';
import { TIMEOUT } from '../../utils/constants';
import { Select } from '../../components/core';

const SAMPLE_DASHBOARD_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const DASHBOARD_FIXTURES = SAMPLE_DASHBOARD_INDEXES.map(i => ({
  dashboard_title: `${i + 1} - Sample dashboard`,
  slug: `${i + 1}-sample-dashboard`,
}));

const test = testWithAssets;

test.setTimeout(TIMEOUT.SLOW_TEST * 3);

test('should show the cross-referenced dashboards', async ({
  page,
  testAssets,
}) => {
  // --- Setup: create sample dashboards and chart via API ---
  const dashboardIds: number[] = [];
  for (const fixture of DASHBOARD_FIXTURES) {
    const response = await apiPostDashboard(page, fixture);
    const body = await response.json();
    const id = body.result?.id ?? body.id;
    dashboardIds.push(id);
    testAssets.trackDashboard(id);
  }

  const dataset = await getDatasetByName(page, 'birth_names');
  if (!dataset) {
    throw new Error(
      'birth_names dataset not found — run Superset with --load-examples',
    );
  }

  const chartResponse = await apiPostChart(page, {
    slice_name: '1 - Sample chart',
    datasource_id: dataset.id,
    datasource_type: 'table',
    viz_type: 'echarts_timeseries_line',
    params: JSON.stringify({
      viz_type: 'echarts_timeseries_line',
      x_axis: 'ds',
      metrics: ['count'],
    }),
  });
  const chartBody = await chartResponse.json();
  const chartId = chartBody.result?.id ?? chartBody.id;
  testAssets.trackChart(chartId);

  // Navigate to chart list and click on the sample chart to open explore
  await page.goto(`${URL.CHART_LIST}?viewMode=table`);
  await page
    .locator('[data-test="listview-table"]')
    .waitFor({ state: 'visible' });

  const chartRow = page
    .locator('[data-test="table-row"]')
    .filter({ hasText: '1 - Sample chart' });
  await chartRow.locator('a').first().click();

  // Wait for explore page to load
  await page.waitForURL('**/explore/**', { timeout: TIMEOUT.PAGE_LOAD });
  await page
    .locator('[data-test="datasource-control"]')
    .waitFor({ state: 'visible', timeout: TIMEOUT.PAGE_LOAD });

  // Verify "Not added to any dashboard"
  await expect(page.getByTestId('metadata-bar')).toContainText(
    'Not added to any dashboard',
  );

  // Open the "On dashboards" submenu and verify "None"
  await page.getByTestId('actions-trigger').click();
  const submenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await submenuTitle.hover({ force: true });
  const submenuPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await expect(submenuPopup).toContainText('None');

  // Close the dropdown
  await submenuTitle.hover({ force: true });
  await page.getByTestId('actions-trigger').click();

  // --- Save chart to dashboards 1 through 11, verifying each ---
  for (let i = 1; i <= 11; i++) {
    const dashboardName = `${i} - Sample dashboard`;

    // Set up intercepts before triggering save
    const updatePromise = waitForPut(
      page,
      new RegExp(`api/v1/chart/${chartId}`),
    );
    const dashboardGetPromise = waitForGet(page, /api\/v1\/dashboard\//);
    const exploreGetPromise = waitForGet(
      page,
      /api\/v1\/explore\/\?(form_data_key|dashboard_page_id|slice_id)=/,
    );

    // Click save button
    const saveButton = page.getByTestId('query-save-button');
    await expect(saveButton).toBeEnabled();
    await saveButton.click({ force: true });

    // Wait for save modal
    const saveModal = page.getByTestId('save-modal-body');
    await saveModal.waitFor({ state: 'visible' });

    // Select the dashboard in the dropdown
    const dashboardSelect = Select.fromRole(page, /Select a dashboard/);
    await dashboardSelect.selectOption(dashboardName);

    // Click save
    await page.getByTestId('btn-modal-save').click();

    // Wait for update API call
    await updatePromise;

    // Wait for modal to close
    await saveModal.waitFor({ state: 'hidden' });

    // Wait for save button to become disabled then re-enabled
    await expect(saveButton).toBeDisabled();

    // Wait for the dashboard GET and explore GET
    await dashboardGetPromise;
    await exploreGetPromise;

    // Verify toast messages
    await expect(page.locator('body')).toContainText(
      `was added to dashboard [${dashboardName}]`,
    );
    await expect(page.locator('body')).toContainText(
      'Chart [1 - Sample chart] has been overwritten',
    );

    // Wait for save button to be re-enabled
    await expect(saveButton).toBeEnabled({ timeout: TIMEOUT.PAGE_LOAD });

    // Verify metadata bar
    const expectedText =
      i > 1 ? `Added to ${i} dashboards` : 'Added to 1 dashboard';
    await expect(page.getByTestId('metadata-bar')).toContainText(expectedText);

    // Open the "On dashboards" submenu and verify the dashboard name
    await page.getByTestId('actions-trigger').click();
    const subTitle = page
      .locator('.ant-dropdown-menu-submenu-title')
      .filter({ hasText: 'On dashboards' });
    await subTitle.hover({ force: true });
    const popup = page.locator('.ant-dropdown-menu-submenu-popup');
    await expect(popup).toContainText(dashboardName);

    // Close the dropdown
    await subTitle.hover({ force: true });
    await page.getByTestId('actions-trigger').click();
  }

  // --- Verify dashboard search functionality ---
  await page.getByTestId('actions-trigger').click();
  const searchSubmenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await searchSubmenuTitle.hover({ force: true });

  const searchPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await searchPopup.hover();

  // Type "1" in search
  const searchInput = searchPopup.locator('input[placeholder="Search"]');
  await searchInput.fill('1');
  await expect(searchPopup).toContainText('1 - Sample dashboard');

  // Type additional text to get no results
  await searchInput.fill('1Blahblah');
  await expect(searchPopup).toContainText('No results found');

  // Clear search
  await searchPopup.locator('[aria-label="close-circle"]').click();

  // Close the dropdown
  await searchSubmenuTitle.hover({ force: true });
  await page.getByTestId('actions-trigger').click();

  // --- Verify dashboard link navigates correctly ---
  const dashboardNavPromise = waitForGet(page, /api\/v1\/dashboard\//);

  await page.getByTestId('actions-trigger').click();
  const linkSubmenuTitle = page
    .locator('.ant-dropdown-menu-submenu-title')
    .filter({ hasText: 'On dashboards' });
  await linkSubmenuTitle.hover({ force: true });

  const linkPopup = page.locator('.ant-dropdown-menu-submenu-popup');
  await linkPopup.hover({ force: true });

  // Remove target attribute to navigate in same tab, then click
  const dashboardLink = linkPopup.locator('a').first();
  await dashboardLink.evaluate(el => el.removeAttribute('target'));
  await dashboardLink.click({ force: true });

  await dashboardNavPromise;
});

/**
 * Skipped: Uses hardcoded datasource ID that may not exist after example loading changes.
 * Migrated from Cypress describe.skip('No Results') for completeness.
 */
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
    metrics: [
      {
        expressionType: 'SIMPLE',
        column: { column_name: 'count', type: 'BIGINT' },
        aggregate: 'COUNT',
        label: 'COUNT(count)',
      },
    ],
    viz_type: 'echarts_timeseries_line',
  };

  const chartDataPromise = page.waitForResponse(response =>
    response.url().includes('api/v1/chart/data'),
  );

  const encodedFormData = encodeURIComponent(JSON.stringify(formData));
  await page.goto(`explore/?form_data=${encodedFormData}`);

  const response = await chartDataPromise;
  expect(response.status()).toBe(200);

  await expect(page.locator('div.chart-container')).toContainText(
    'No results were returned for this query',
  );
});
