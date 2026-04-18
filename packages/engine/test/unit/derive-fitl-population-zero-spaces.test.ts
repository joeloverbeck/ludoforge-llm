// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveFitlPopulationZeroSpaces } from '../helpers/production-spec-helpers.js';

const EXPECTED_POPULATION_ZERO_SPACES = [
  'central-laos',
  'loc-ban-me-thuot-da-lat',
  'loc-cam-ranh-da-lat',
  'loc-can-tho-bac-lieu',
  'loc-can-tho-chau-doc',
  'loc-can-tho-long-phu',
  'loc-da-nang-dak-to',
  'loc-da-nang-qui-nhon',
  'loc-hue-da-nang',
  'loc-hue-khe-sanh',
  'loc-kontum-ban-me-thuot',
  'loc-kontum-dak-to',
  'loc-kontum-qui-nhon',
  'loc-qui-nhon-cam-ranh',
  'loc-saigon-an-loc-ban-me-thuot',
  'loc-saigon-cam-ranh',
  'loc-saigon-can-tho',
  'loc-saigon-da-lat',
  'north-vietnam',
  'northeast-cambodia',
  'phuoc-long',
  'sihanoukville',
  'southern-laos',
  'the-fishhook',
  'the-parrots-beak',
] as const;

describe('deriveFitlPopulationZeroSpaces', () => {
  it('derives the current FITL population-0 spaces from the authoritative production map asset', () => {
    const populationZeroSpaces = deriveFitlPopulationZeroSpaces();

    assert.deepEqual(
      [...populationZeroSpaces].sort(),
      [...EXPECTED_POPULATION_ZERO_SPACES].sort(),
    );
    assert.equal(populationZeroSpaces.includes('saigon'), false);
  });
});
