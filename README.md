# Doruk Ciğerim Kasa (çok mağazalı)

- Sahip: tüm mağazaları canlı görür, menüyü/fiyatları/personeli yönetir.
- Her mağaza: kendi giriş hesabı, kendi personeli (Müdür / Kasiyer), kendi raporu.
- Veriler Google Firebase'de. İnternet kesilirse satışlar cihazda bekler, bağlantı gelince gönderilir.

Dosyalar: `index.html`, `app.js`, `config.js` (Firebase bilgileri), `sw.js`, `manifest.webmanifest`, `logo.jpg`, `icons/`.
`firestore.rules` → Firebase konsolunda Firestore → Kurallar bölümüne yapıştırılır.
