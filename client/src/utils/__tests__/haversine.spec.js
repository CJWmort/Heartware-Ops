// Unit tests (Vitest) for the distance helper.

import { describe, it, expect } from 'vitest'
import { haversineKm } from '../haversine'

const NATIONAL_STADIUM = { lat: 1.304, lng: 103.8746 }
const PADANG = { lat: 1.2932, lng: 103.852 }
const CHANGI_AIRPORT = { lat: 1.3644, lng: 103.9915 }
const TUAS = { lat: 1.3201, lng: 103.6366 }

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(PADANG, PADANG)).toBeCloseTo(0, 5)
  })

  it('is symmetric (A→B equals B→A)', () => {
    expect(haversineKm(PADANG, CHANGI_AIRPORT)).toBeCloseTo(haversineKm(CHANGI_AIRPORT, PADANG), 6)
  })

  it('National Stadium to Padang is about 2.8 km', () => {
    expect(haversineKm(NATIONAL_STADIUM, PADANG)).toBeCloseTo(2.79, 1)
  })

  it('Tuas to Changi Airport is about 40 km (roughly the width of Singapore)', () => {
    const d = haversineKm(TUAS, CHANGI_AIRPORT)
    expect(d).toBeGreaterThan(38)
    expect(d).toBeLessThan(42)
  })

  it('1 degree of latitude is about 111 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 0)
  })
})
