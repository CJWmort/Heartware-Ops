# API contract

This is the agreement between frontend and backend. **If you change an endpoint, update this file in the same PR.**

- Base URL (local): `http://localhost:8000/api`
- All bodies are JSON.
- Protected routes need the header `Authorization: Bearer <token>` (the client's `services/api.js` adds it for you).
- Errors look like `{ "message": "Human readable reason" }` with a 4xx/5xx status.
- Every stub currently returns **501 Not Implemented** until its owner builds it.

Auth column: 🌐 public · 👤 any logged-in user · 🙋 volunteer · 🧑‍💼 coordinator · 🛰️ hq

## Health
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | 🌐 | Server + DB status (already works) |

## Auth & profile — F1a (Kuah)
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | 🌐 | `{ name, email, password, phone, postalCode, availableDates[], consent: { location: true } }` | `{ token, user }` |
| POST | `/auth/login` | 🌐 | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | 👤 | – | `{ user }` |
| GET | `/volunteers/me` | 🙋 | – | volunteer profile |
| PATCH | `/volunteers/me` | 🙋 | `{ phone?, availableDates? }` | updated profile |
| GET | `/volunteers` | 🧑‍💼 | `?eventId=` | list of volunteers |
| GET | `/schools` | 👤 | `?q=` | list of schools |
| GET | `/schools/:id` | 👤 | – | one school |
| GET | `/events` | 👤 | – | show dates |
| POST | `/events` | 🧑‍💼 | `{ name, date, venue }` | created event |

## Allocation — F1b (Fanny)
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| POST | `/allocations/run` | 🧑‍💼 | `{ eventId }` | `{ slots[], summary: { filled, unfilled, bySchool[] } }` |
| GET | `/allocations` | 🧑‍💼 | `?eventId=` | slots with school + volunteer populated |
| PATCH | `/allocations/slots/:slotId` | 🧑‍💼 | `{ volunteerId }` | `{ slot, warnings[] }` |
| POST | `/allocations/publish` | 🧑‍💼 | `{ eventId }` | `{ publishedCount }` |
| GET | `/allocations/me` | 🙋 | – | my published slot(s) |
| POST | `/allocations/slots/:slotId/respond` | 🙋 | `{ response: "accepted" \| "declined" }` | updated slot |

## Replacement — F2 (Yap)
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| POST | `/replacements/drop-out` | 🙋 | `{ slotId, reason, note? }` | replacement (status `open`) |
| POST | `/replacements/no-show` | 🧑‍💼 | `{ slotId }` | replacement |
| GET | `/replacements/open` | 👤 | – | open replacements (volunteers: only ones near them + available that date) |
| POST | `/replacements/:id/claim` | 🙋 | – | replacement with my claim |
| GET | `/replacements/:id/candidates` | 🧑‍💼 | `?radiusKm=5` | `[{ volunteer, distanceKm, claimed }]` |
| POST | `/replacements/:id/approve` | 🧑‍💼 | `{ volunteerId }` | filled replacement + updated slot |
| POST | `/replacements/swaps` | 🙋 | `{ mySlotId, otherSlotId }` | swap request |
| PATCH | `/replacements/swaps/:id` | 🧑‍💼 | `{ decision: "approved" \| "rejected" }` | swap |
| GET | `/replacements/history` | 🧑‍💼 | `?eventId=` | audit log entries |

## Tracking — F3 (Chin)
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET | `/tracking/checkpoints` | 🌐 | – | ordered checkpoint list |
| POST | `/tracking/check-ins` | 🙋 | `{ slotId, checkpoint, lat, lng }` | check-in |
| POST | `/tracking/pings` | 🙋 | `{ slotId, lat, lng, accuracy }` | `204` |
| GET | `/tracking/live` | 🛰️ | `?eventId=` | `[{ slot, school, volunteer, lastCheckpoint, lastLocation, updatedAt }]` |
| GET | `/tracking/groups/:slotId/timeline` | 🛰️ | – | check-ins + pings for one group |

## Incidents & alerts — F4 (Wei Ming)
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET | `/incidents/templates` | 🌐 | – | template list |
| POST | `/incidents` | 🙋 | `{ slotId, type, severity?, note?, photoUrl?, lat?, lng? }` | incident |
| GET | `/incidents` | 🛰️ | `?status=new` | incidents |
| PATCH | `/incidents/:id/status` | 🛰️ | `{ status, note? }` | incident |
| GET | `/incidents/alerts` | 🛰️ | `?status=open` | overdue-checkpoint alerts |
| PATCH | `/incidents/alerts/:id/acknowledge` | 🛰️ | – | alert |

**Socket.IO events (server → client):** `incident:new`, `incident:updated`, `alert:new`, `tracking:update`

## Badges — F5 (Hanafi)
| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| GET | `/badges` | 👤 | – | badge catalogue |
| POST | `/badges/auto-award` | 🧑‍💼 | `{ eventId }` | `{ awardedCount }` |
| POST | `/badges/award` | 🧑‍💼 | `{ volunteerIds[], badgeCode, event, message }` | given, skipped |
| GET | `/badges/me` | 🙋 | – | my awards |
| GET | `/badges/design/me` | 🙋 | – | my saved design (or default) |
| PUT | `/badges/design/me` | 🙋 | `{ shape, primaryColor, secondaryColor, emblem, ribbonText }` | design |
| POST | `/badges/orders` | 🙋 | `{ address: { line1, unit?, postalCode } }` | order (locks design) |
| GET | `/badges/orders/me` | 🙋 | – | my orders |
| PATCH | `/badges/orders/:id/status` | 🧑‍💼 | `{ status }` | order |

## External APIs
| API | Used by | Notes |
|---|---|---|
| OneMap Search `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=<postal>&returnGeom=Y&getAddrDetails=Y&pageNum=1` | F1a (server, on register) | No key needed for search. Store the result; never call it on every page load. |
| data.gov.sg datastore `https://data.gov.sg/api/action/datastore_search?resource_id=<id>` | F1a seed script | "General information of schools" dataset – filter `mainlevel_code = PRIMARY`. Check the dataset page for the current resource id. |
| OpenStreetMap tiles via Leaflet | F1b, F2, F3 | Credit "© OpenStreetMap contributors" on the map. |
