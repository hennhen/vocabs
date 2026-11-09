# "Add to Vocabs" from the share sheet

Web apps can't appear in the iOS share sheet directly, but Shortcuts can. This Shortcut sends the
selected word to your Vocabs server. The app picks it up (and auto-fills it) the next time you
open it, and you stay in whatever you were reading.

## Set it up once (about 3 minutes)
1. Open the **Shortcuts** app → **+** to make a new shortcut. Name it **Add to Vocabs**.
2. Turn on **Show in Share Sheet** (shortcut name at the top → details/ⓘ).
   - In the first block, "Receive **Any** input from **Share Sheet**": tap **Any**, deselect
     everything except **Text**.
   - "If there's no input": choose **Ask For** → **Text**, so you can also run it by hand.
3. Add the action **Get Contents of URL**:
   - URL: `https://vocabs.<your-subdomain>.workers.dev/api/inbox`
   - Tap the ▸ arrow to show more options:
     - Method: **POST**
     - Headers: add one. Key `Authorization`, value `Bearer <your APP_TOKEN passphrase>`
       (the word Bearer, a space, then the passphrase)
     - Request Body: **JSON**, add a **Text** field. Key `term`, value: the **Shortcut Input**
       variable
4. Add the action **Show Notification** and set its text to the **Contents of URL** variable.
5. Done.

## Use it
Select a word anywhere (Safari, Books, Notes, Kindle highlights you copy…) → **Share…** →
**Add to Vocabs**. A notification says *Added “aghast” to Vocabs*. Next time you open Vocabs it
shows "Added 1 word from Share" and fills in the card.

Tip: in the share sheet, tap **Edit Actions** to move Add to Vocabs near the top.
