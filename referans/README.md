# Referans dosyaları

`Heatemp_Mekonsis_ERP_Yol_Haritasi.pdf` ve `Mekonsis_Heatamp_Stok_Takip (1).xlsx` gibi
iş dosyalarını bu klasöre koyun. Klasörün içeriği `.gitignore` ile depoya eklenmez
(gerçek ticari veri içerebilir).

Excel'i salt okunur incelemek ve alan eşleştirme raporu üretmek için:

```bash
npm run excel:incele -- "referans/Mekonsis_Heatamp_Stok_Takip (1).xlsx"
# → docs/excel-inceleme-sonucu.md
```

Betik veritabanına hiçbir şey yazmaz.
