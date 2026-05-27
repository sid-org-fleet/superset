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
import { DashboardPage } from '../../pages/DashboardPage';
import { createTestDashboard } from './dashboard-test-helpers';
import { waitForPost } from '../../helpers/api/intercepts';

const FAVORITES_URL_PATTERN = /\/api\/v1\/dashboard\/\d+\/favorites\//;

testWithAssets(
  'should allow to favorite/unfavorite dashboard',
  async ({ page, testAssets }) => {
    const { id: dashboardId } = await createTestDashboard(
      page,
      testAssets,
      testWithAssets.info(),
      { prefix: 'test_actions' },
    );

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.gotoById(dashboardId);
    await dashboardPage.waitForLoad();

    const headerContainer = page.getByTestId('dashboard-header-container');

    // Click unstarred icon to add to favorites
    const unstarredIcon = headerContainer.locator("[aria-label='unstarred']");
    await expect(unstarredIcon).toBeVisible();

    const favResponse = waitForPost(page, FAVORITES_URL_PATTERN);
    await unstarredIcon.click();
    await favResponse;

    // Starred icon should appear with gold color
    const starredIcon = headerContainer.locator("[aria-label='starred']");
    await expect(starredIcon).toBeVisible();
    await expect(starredIcon).toHaveCSS('color', 'rgb(252, 199, 0)');

    // Click starred icon to remove from favorites
    const unfavResponse = waitForPost(page, FAVORITES_URL_PATTERN);
    await starredIcon.click();
    await unfavResponse;

    // Unstarred icon should reappear with gray color
    const unstarredIconAfter = headerContainer.locator(
      "[aria-label='unstarred']",
    );
    await expect(unstarredIconAfter).toBeVisible();
    await expect(unstarredIconAfter).toHaveCSS('color', 'rgba(0, 0, 0, 0.45)');
  },
);
