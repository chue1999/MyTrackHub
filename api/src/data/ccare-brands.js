/**
 * CCare branches / service points (BID → Bname), for the BrandID dropdown.
 * Tb_User_detail.BrandID stores the BID as text (at most 2 characters).
 */
export const CCARE_BRANDS = Object.freeze([
  { id: '1', name: 'ATP-Samakkesai-LTC' },
  { id: '2', name: 'BOK-Houysay-LTC' },
  { id: '3', name: 'BLK-Paksun-LTC' },
  { id: '4', name: 'CHP-pakse-LTC' },
  { id: '5', name: 'HUP-Xamnuea-LTC' },
  { id: '6', name: 'KHM-Thakek-TPL' },
  { id: '7', name: 'LNT-NT-LTC' },
  { id: '8', name: 'LPB-HQ-TPL' },
  { id: '9', name: 'UDX-Say-LTC' },
  { id: '10', name: 'PSL-Bounnuea-LTC' },
  { id: '11', name: 'SVN-HQ-TPL' },
  { id: '12', name: 'XSB-Anouvong-LTC' },
  { id: '13', name: 'SLV-SLV-LTC' },
  { id: '14', name: 'XKG-larmam-LTC' },
  { id: '15', name: 'HQ-Saylom-TPL' },
  { id: '16', name: 'VTP-Viengkham-LTC' },
  { id: '17', name: 'XYL-XYL-LTC' },
  { id: '18', name: 'VTP-VV-LTC' },
  { id: '19', name: 'VTE-Dongdok- LTC' },
  { id: '20', name: 'Vientiane Center' },
  { id: '21', name: 'VTE FlagShip' },
  { id: '22', name: 'TPLUS Service Point' },
  { id: '23', name: 'SVN-kaison-LTC' },
  { id: '24', name: 'SVN-HQ-TPL' },
  { id: '27', name: 'New Office-LPB' },
  { id: '28', name: 'BLK-20KM-LTC' },
  { id: '29', name: 'On line chat facebook' },
  { id: '31', name: 'On line chat whatsapp' },
  { id: '34', name: 'UDX-Houn-LTC' },
  { id: '35', name: 'LPB-lpb-LTC' },
  { id: '36', name: 'XKH-Pek-LTC' },
  { id: '37', name: 'Mobile Service Car' },
  { id: '38', name: 'BOK-Thonphaeng-LTC' },
]);

export const CCARE_BRAND_IDS = new Set(CCARE_BRANDS.map((b) => b.id));
