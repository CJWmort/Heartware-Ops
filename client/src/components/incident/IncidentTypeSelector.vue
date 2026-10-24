import { onMounted, ref } from 'vue' import { listTemplates, reportIncident, getAddressAt } from
'@/services/incidents' import { getUserLocation, geolocationMessage } from '@/utils/geolocation'
