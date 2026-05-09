# Amplitude Session Replay -- Guide d'implementation via Tealium

## Contexte

Si je ne me trompe pas, vous utilisez **Tealium EventStream** (connecteur serveur) pour envoyer vos evenements analytics a Amplitude. Le SDK Browser d'Amplitude n'est donc pas charge sur vos pages.

Pour activer Session Replay dans cette architecture, vous devez utiliser le **SDK Standalone Session Replay** (`@amplitude/session-replay-browser`), charge cote client via un tag Tealium iQ de type "Custom JavaScript".

> **Important :** Le tag que nous vous avions fourni l'ete dernier (avril 2025, version `1236.20240930`) est **obsolete**. Il chargeait le SDK Browser complet + le plugin SR. Ce n'est pas adapte a votre architecture EventStream et la version du plugin SR etait figee a 1.13.9 (la version actuelle est 1.42.2).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Navigateur de l'utilisateur                                │
│                                                             │
│  ┌───────────────────┐      ┌────────────────────────────┐ │
│  │  Tealium utag.js  │      │  Session Replay SDK        │ │
│  │  (data layer)     │─────>│  @amplitude/session-replay │ │
│  │                   │      │  -browser v1.42.2          │ │
│  └────────┬──────────┘      └─────────────┬──────────────┘ │
│           │                               │                 │
└───────────┼───────────────────────────────┼─────────────────┘
            │                               │
            ▼                               ▼
  Tealium EventStream              Amplitude Session
  (serveur → Amplitude             Replay API
   HTTP API)                       (cdn.amplitude.com)
            │                               │
            ▼                               ▼
      ┌──────────────────────────────────────────┐
      │         Amplitude (memes device_id       │
      │         et session_id = replays lies)     │
      └──────────────────────────────────────────┘
```

---

## Pre-requis

1. **Tealium iQ** doit etre actif sur vos pages (pour deployer le tag custom).
2. Votre **data layer Tealium** (`utag_data`) doit exposer :
   - `amplitude_device_id` -- l'identifiant appareil (meme valeur envoyee via EventStream)
   - `amplitude_session_id` -- le timestamp de debut de session en millisecondes (meme valeur envoyee via EventStream)
3. Les valeurs de `device_id` et `session_id` **doivent etre identiques** entre le tag client (Session Replay) et les evenements envoyes cote serveur via EventStream. Si elles different, les replays ne seront pas rattaches aux evenements analytics.

---

## Installation pas a pas

### Etape 1 : Creer le tag dans Tealium iQ

1. Dans Tealium iQ, allez dans **Tags** > **Add Tag**
2. Choisissez **Custom Container** (ou **Tealium Custom Container**)
3. Nommez le tag : `Amplitude Session Replay`
4. Collez le contenu du fichier `session_replay_tealium_tag.js`

### Etape 2 : Configurer les variables

Dans le bloc `CONFIG` en haut du script, ajustez :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `apiKey` | Votre cle API Amplitude (projet) | `"a1b2c3d4e5f6..."` |
| `sampleRate` | Pourcentage de sessions capturees (0.0 a 1.0) | `0.1` (= 10%) |
| `deviceIdVar` | Nom de la variable data layer pour le device ID | `"amplitude_device_id"` |
| `sessionIdVar` | Nom de la variable data layer pour le session ID | `"amplitude_session_id"` |

### Etape 3 : Configurer le declenchement (Load Rules)

- **Declenchement :** sur toutes les pages (`All Pages`) ou sur le perimetre souhaite
- **Timing :** `After Load Rules` (par defaut) -- le tag doit se declencher apres que le data layer soit rempli

### Etape 4 : Publier

1. Sauvegardez le tag
2. Testez en mode **Preview** dans Tealium
3. Verifiez dans la console navigateur :
   - Vous devriez voir `Amplitude SR: initialized (deviceId=..., sessionId=...)`
   - Un appel reseau vers `https://api-sr.amplitude.com/sessions/v2/track` confirme l'envoi des donnees replay
4. Dans Amplitude, verifiez la presence de l'evenement `[Amplitude] Replay Captured`
5. Publiez en production

---

## Gestion des navigations SPA

Si votre site est une Single Page Application :

- Le tag detecte automatiquement s'il a deja ete initialise (`window.__amplitudeSessionReplayInitialized`)
- Lors des navigations suivantes, il appelle `setSessionId()` avec la valeur courante du data layer
- **Assurez-vous** que `utag_data.amplitude_session_id` est mis a jour lorsque la session change (timeout de 30 min d'inactivite par defaut cote Amplitude)

---

## Configuration avancee

### Masquage de donnees sensibles

Ajoutez un objet `privacyConfig` dans les options d'initialisation :

```javascript
window.sessionReplay.init(CONFIG.apiKey, {
  deviceId: deviceId,
  sessionId: sessionIdNum,
  sampleRate: CONFIG.sampleRate,
  privacyConfig: {
    blockSelector: ['.donnees-bancaires', '#carte-credit'],
    maskSelector: ['.email-utilisateur', '.adresse'],
    unmaskSelector: ['.contenu-public']
  }
});
```

- `blockSelector` : elements remplaces par un rectangle gris dans le replay
- `maskSelector` : texte remplace par des asterisques
- `unmaskSelector` : elements explicitement non-masques

Les champs `<input>` sont masques par defaut. Pour les demasquer, ajoutez la classe `amp-unmask`.

### Content Security Policy (CSP)

Si votre site utilise une CSP stricte, ajoutez :

```
script-src: https://cdn.amplitude.com;
connect-src: https://api-sr.amplitude.com;
worker-src: blob:;
```

---

## Taux d'echantillonnage recommande

| Quota mensuel | Sessions mensuelles moyennes | sampleRate recommande |
|---------------|------------------------------|----------------------|
| 100 000       | 1 000 000                    | `0.10` (10%)         |
| 500 000       | 2 000 000                    | `0.25` (25%)         |
| 2 500 000     | 3 000 000                    | `0.80` (80%)         |

Commencez bas (`0.01`) et augmentez progressivement pour repartir le quota sur le mois entier.

Mon avis serait en fait de créer un graphique des User Sessions et de vérifier le nombre total de sessions sur les 30 derniers jours, ou encore mieux, sur une base mensuelle à partir de
janvier 2026.

Si vous souhaitez suivre une approche mensuelle depuis janvier, veuillez calculer la valeur moyenne du nombre de sessions, puis prendre 20 % de ce chiffre. Pour un volume d’environ 550k
sessions par mois, je recommande généralement de configurer le `sampleRate` dans l’UI à 2 % afin d’éviter de consommer tous les replays en seulement 3 ou 4 jours.

---

## Verification et debug

1. **Console navigateur** : recherchez les messages prefixes par `Amplitude SR:`
2. **Onglet Network** : filtrez sur `amplitude.com` -- vous devriez voir des requetes POST vers `/sessions/v2/track`
3. **Amplitude UI** : allez dans le projet, cherchez l'evenement `[Amplitude] Replay Captured`. Cliquez sur une session pour visualiser le replay.
4. **Mode debug** : ajoutez `debugMode: true` dans les options d'init pour des logs supplementaires (ne pas laisser en production)

---

## Versions de reference (mai 2026)

| Package | Version | Usage |
|---------|---------|-------|
| `@amplitude/session-replay-browser` | **1.42.2** | SDK Standalone (votre cas) |
| `@amplitude/plugin-session-replay-browser` | 1.30.1 | Plugin Browser SDK (non applicable) |
| Version minimum recommandee | 1.31.4+ | Selon la documentation officielle |

---

## Support

Pour toute question sur l'implementation, contactez Romain Liégeois pendant mon absence.

Je vous partage aussi notre documentation officielle : https://amplitude.com/docs/session-replay/session-replay-standalone-sdk
Ici, je vous laisse la doc de notre npm package : https://www.npmjs.com/package/@amplitude/session-replay-browser
Au cas où, voici la version originelle du tag : https://gist.github.com/jnthns/8535c140a8440b29d0722a225d220ce9 
