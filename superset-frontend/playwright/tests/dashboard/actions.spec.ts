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
import { DashboardPage } from '../../pages/DashboardPage';
import { TIMEOUT } from '../../utils/constants';

/**
 * Dashboard Actions E2E tests.
 *
 * Migrated from: cypress-base/cypress/e2e/dashboard/actions.test.js
 *
 * Tests verify the favorite/unfavorite toggle functionality on a dashboard:
 * - Clicking the unstarred icon sends a POST to the favorites API
 * - The icon switches to a filled star with gold color
 * - Clicking the filled star sends another POST to toggle off favorites
 * - The icon reverts to an outlined star with gray color
 *
 * Prerequisites:
 * - Superset running with API accessible
 * - Admin user authenticated (via global-setup)
 */

testWithAssets(
  'should allow to favorite/unfavorite dashboard',
  async ({ page, testAssets }) => {
    // Create a sample dashboard via API (mirrors cy.createSampleDashboards([0]))
    const dashResp = await apiPostDashboard(page, {
      dashboard_title: `1 - Sample dashboard`,
      slug: `1-sample-dashboard-${Date.now()}`,
    });
    expect(dashResp.ok()).toBe(true);
    const dashBody = await dashResp.json();
    const dashboardId: number = dashBody.result?.id ?? dashBody.id;
    expect(dashboardId).toBeTruthy();
    testAssets.trackDashboard(dashboardId);

    // Navigate to the created dashboard
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.gotoById(dashboardId);
    await dashboardPage.waitForLoad({ timeout: TIMEOUT.PAGE_LOAD });

    const headerContainer = page.locator(
      '[data-test="dashboard-header-container"]',
    );

    // Wait for and intercept the favorites POST request when clicking star
    const favResponsePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/dashboard/') &&
        resp.url().includes('/favorites/') &&
        resp.request().method() === 'POST',
    );

    // Find and click the unstarred icon (adds to favorites)
    const starIconOutlined = headerContainer.locator(
      '[aria-label="unstarred"]',
    );
    await expect(starIconOutlined).toBeVisible();
    await starIconOutlined.click();

    // Wait for the favorites API response
    await favResponsePromise;

    // After clicking, the starred (filled) icon should appear
    const starIconFilled = headerContainer.locator('[aria-label="starred"]');
    await expect(starIconFilled).toBeVisible();

    // Verify the color of the filled star (gold)
    const filledColor = await starIconFilled.evaluate(
      el => getComputedStyle(el).color,
    );
    expect(filledColor).toBe('rgb(252, 199, 0)');

    // Wait for and intercept the unfavorite POST request
    const unfavResponsePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/v1/dashboard/') &&
        resp.url().includes('/favorites/') &&
        resp.request().method() === 'POST',
    );

    // Click on the filled star (removes from favorites)
    await starIconFilled.click();

    // Wait for the unfavorite API response
    await unfavResponsePromise;

    // After clicking, the unstarred (outlined) icon should reappear
    const starIconOutlinedAfter = headerContainer.locator(
      '[aria-label="unstarred"]',
    );
    await expect(starIconOutlinedAfter).toBeVisible();

    // Verify the color of the outlined star (gray)
    const outlinedColor = await starIconOutlinedAfter.evaluate(
      el => getComputedStyle(el).color,
    );
    expect(outlinedColor).toBe('rgba(0, 0, 0, 0.45)');
  },
);
