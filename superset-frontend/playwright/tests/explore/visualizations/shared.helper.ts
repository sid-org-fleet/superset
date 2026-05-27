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

/**
 * Shared constants and helpers for explore visualization Playwright tests.
 * Migrated from cypress-base/cypress/e2e/explore/visualizations/shared.helper.js
 */

import { Page } from '@playwright/test';
import { getDatasetByName } from '../../../helpers/api/dataset';

/**
 * Look up a dataset ID by table name.
 * Uses the existing Playwright API helper getDatasetByName under the hood.
 * @param page - Playwright page instance (provides authentication context)
 * @param tableName - The name of the table to look up
 * @returns The dataset ID
 * @throws Error if the dataset is not found
 */
export async function getDatasetId(
  page: Page,
  tableName: string,
): Promise<number> {
  const dataset = await getDatasetByName(page, tableName);
  if (!dataset) {
    throw new Error(`Dataset with table name "${tableName}" not found`);
  }
  return dataset.id;
}

export interface AdhocFilter {
  clause: string;
  subject: string;
  operator: string;
  comparator: string | string[];
  expressionType: string;
  sqlExpression?: string | null;
  filterOptionName?: string;
}

export interface MetricColumn {
  id: number;
  column_name: string;
  verbose_name: string | null;
  description: string | null;
  expression: string | null;
  filterable: boolean;
  groupby: boolean;
  is_dttm: boolean;
  type: string;
  database_expression?: string | null;
  python_date_format: string | null;
  optionName: string;
}

export interface SimpleMetric {
  expressionType: 'SIMPLE';
  column: MetricColumn;
  aggregate: string;
  sqlExpression: string | null;
  hasCustomLabel: boolean;
  label: string;
  optionName: string;
  isNew?: boolean;
}

export interface SqlMetric {
  expressionType: 'SQL';
  sqlExpression: string;
  column: null;
  aggregate: null;
  isNew: boolean;
  hasCustomLabel: boolean;
  label: string;
  optionName: string;
}

export interface FormDataDefaults {
  datasource: string;
  time_grain_sqla: null;
  x_axis: string;
  adhoc_filters: AdhocFilter[];
  groupby: string[];
  limit: null;
  timeseries_limit_metric: null;
  order_desc: boolean;
  contributionMode: null;
}

export interface HealthPopFormDataDefaults {
  datasource: string;
  granularity_sqla: string;
  time_grain_sqla: string;
  time_range: string;
}

export const FORM_DATA_DEFAULTS: FormDataDefaults = {
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
  ],
  groupby: [],
  limit: null,
  timeseries_limit_metric: null,
  order_desc: false,
  contributionMode: null,
};

export const HEALTH_POP_FORM_DATA_DEFAULTS: HealthPopFormDataDefaults = {
  datasource: '2__table',
  granularity_sqla: 'ds',
  time_grain_sqla: 'P1D',
  time_range: '1960-01-01 : 2014-01-02',
};

export const NUM_METRIC: SimpleMetric = {
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
};

export const MAX_DS: SimpleMetric = {
  aggregate: 'MAX',
  column: {
    column_name: 'ds',
    description: null,
    expression: null,
    filterable: true,
    groupby: true,
    id: 333,
    is_dttm: true,
    optionName: '_col_ds',
    python_date_format: null,
    type: 'TIMESTAMP WITHOUT TIME ZONE',
    verbose_name: null,
  },
  expressionType: 'SIMPLE',
  hasCustomLabel: false,
  isNew: false,
  label: 'MAX(ds)',
  optionName: 'metric_pbib7j9m15a_js80vs9vca',
  sqlExpression: null,
};

export const MAX_STATE: SqlMetric = {
  expressionType: 'SQL',
  sqlExpression: 'MAX(UPPER(state))',
  column: null,
  aggregate: null,
  isNew: false,
  hasCustomLabel: false,
  label: 'MAX(UPPER(state))',
  optionName: 'metric_kvval50pvbo_hewj3pzacb',
};

export const SIMPLE_FILTER: AdhocFilter = {
  expressionType: 'SIMPLE',
  subject: 'name',
  operator: 'IN',
  comparator: ['Aaron', 'Amy', 'Andrea'],
  clause: 'WHERE',
  sqlExpression: null,
  filterOptionName: 'filter_4y6teao56zs_ebjsvwy48c',
};
