# Guide D'Implementation Du Calendrier

## Base De Comparaison

Ce document compare le workspace courant avec le depot officiel `marmelab/atomic-crm`, tel qu'il est configure localement sur `origin/main`.

- Remote officiel local: `https://github.com/marmelab/atomic-crm.git`
- Branche de reference: `origin/main`
- Commit de reference local: `8126ceb730912b2d5022abab8a93173d7a0b0e43`

Le workspace contient deux chantiers melanges:

- La fonctionnalite calendrier / rendez-vous
- Une fonctionnalite distincte de recordings / transcription audio

Si l'objectif est uniquement d'ajouter le calendrier au projet officiel, il faut reprendre seulement la partie `appointments` et ignorer le chantier `recordings`.

## Ce Qui Est Requis Pour Le Calendrier

### 1. Ajouter Le Modele De Donnees `appointments`

Fichiers concernes:

- `supabase/schemas/01_tables.sql`
- `supabase/schemas/04_triggers.sql`
- `supabase/schemas/05_policies.sql`
- `supabase/schemas/06_grants.sql`

Ce qui a ete ajoute:

- Nouvelle table `public.appointments`
- Colonnes:
  - `id`
  - `contact_id`
  - `title`
  - `description`
  - `start_at`
  - `end_at`
  - `location`
  - `source`
  - `status`
  - `sales_id`
  - `created_at`
- Index:
  - `appointments_contact_id_idx`
  - `appointments_start_at_idx`
  - `appointments_sales_id_idx`
- Foreign keys:
  - `contact_id -> contacts(id)` avec `on delete set null`
  - `sales_id -> sales(id)`
- Trigger `set_appointments_sales_id_trigger` pour appliquer `set_sales_id_default()`
- RLS activee sur `appointments`
- Policies CRUD pour les utilisateurs authentifies
- Grants sur la table et la sequence

Remarque importante:

- `status` et `source` sont stockes en `text`, sans `CHECK` SQL.
- Les valeurs sont contraintes par l'UI, pas par la base.
- `contact_id` est nullable, ce qui permet de creer un rendez-vous depuis le calendrier sans contact preselectionne.

## 2. Ajouter Le Type Metier Cote Frontend

Fichier concerne:

- `src/components/atomic-crm/types.ts`

Ce qui a ete ajoute:

- `AppointmentSource`
- `AppointmentStatus`
- `Appointment`

Ces types sont utilises partout dans les composants `appointments`.

## 3. Declarer Le Resource React-Admin

Fichier concerne:

- `src/components/atomic-crm/root/CRM.tsx`

Ce qui a ete ajoute:

- Import de `appointments` depuis `../appointments`
- `<Resource name="appointments" {...appointments} />` en desktop
- `<Resource name="appointments" {...appointments} />` en mobile

Point important:

- Aucune logique custom n'a ete ajoutee au data provider.
- Le CRUD repose sur le comportement generique du provider Supabase existant.

## 4. Ajouter Les Dependances Calendrier

Fichiers concernes:

- `package.json`
- `package-lock.json`
- `src/main.tsx`

Ce qui a ete ajoute:

- `@schedule-x/calendar`
- `@schedule-x/react`
- `@schedule-x/theme-default`
- `@schedule-x/event-modal`
- `temporal-polyfill`
- Import global `temporal-polyfill/global` dans `src/main.tsx`

Pourquoi le polyfill est obligatoire:

- `Schedule-X` v4 utilise `Temporal` en global.
- Sans `import "temporal-polyfill/global"`, l'onglet calendrier plante avec `Temporal is not defined`.

## 5. Creer Le Module `appointments`

Nouveaux fichiers:

- `src/components/atomic-crm/appointments/index.tsx`
- `src/components/atomic-crm/appointments/AppointmentList.tsx`
- `src/components/atomic-crm/appointments/AppointmentInputs.tsx`
- `src/components/atomic-crm/appointments/AppointmentCreateSheet.tsx`
- `src/components/atomic-crm/appointments/AppointmentEditSheet.tsx`
- `src/components/atomic-crm/appointments/ContactAppointmentsList.tsx`
- `src/components/atomic-crm/appointments/AddAppointment.tsx`

Role de chaque fichier:

- `index.tsx`
  - Export du resource React-Admin
  - Branche `list` sur `AppointmentList`
- `AppointmentList.tsx`
  - Ecran principal du calendrier
  - Charge les rendez-vous via `useGetList`
  - Convertit les dates ISO en `Temporal.ZonedDateTime`
  - Monte `ScheduleXCalendar`
  - Ouvre la creation au clic sur une date
  - Ouvre l'edition au clic sur un evenement
- `AppointmentInputs.tsx`
  - Champs partages du formulaire
  - `title`, `description`, `start_at`, `end_at`, `location`, `contact_id`, `source`, `status`
- `AppointmentCreateSheet.tsx`
  - Creation d'un rendez-vous dans un bottom sheet
  - Pre-remplit `sales_id`, `status`, `source`, `start_at`, `end_at`
- `AppointmentEditSheet.tsx`
  - Edition d'un rendez-vous
  - Ajoute la suppression
- `ContactAppointmentsList.tsx`
  - Liste des rendez-vous d'un contact dans l'aside contact
- `AddAppointment.tsx`
  - Bouton de creation rapide depuis une fiche contact

## 6. Integrer Le Calendrier Dans La Navigation

Fichiers concernes:

- `src/components/atomic-crm/layout/Header.tsx`
- `src/components/atomic-crm/layout/MobileNavigation.tsx`

Ce qui a ete ajoute:

- Detection de route `/appointments/*`
- Onglet desktop "Calendrier"
- Bouton mobile avec icone `CalendarDays`

## 7. Integrer Les Rendez-Vous Dans La Fiche Contact

Fichier concerne:

- `src/components/atomic-crm/contacts/ContactAside.tsx`

Ce qui a ete ajoute:

- Une section "Rendez-vous"
- `ContactAppointmentsList`
- `AddAppointment`

Objectif:

- Voir les RDV lies a un contact
- Creer un RDV pre-rattache a ce contact

## 8. Correctifs Techniques Necessaires Pour Que Le Calendrier Soit Utilisable

Fichiers concernes:

- `src/components/atomic-crm/appointments/AppointmentList.tsx`
- `src/components/ui/sheet.tsx`
- `src/main.tsx`

Ce qui a ete corrige:

- Conversion des dates vers `Temporal.ZonedDateTime`
- Configuration du `timezone` du calendrier a partir du navigateur
- Configuration de la `locale` du calendrier a partir de la locale RA
- Application du theme sombre via la classe `is-dark`
- Forcage de la hauteur des wrappers internes `Schedule-X`
- Augmentation du `z-index` du `Sheet` a `200`

Pourquoi ces correctifs sont necessaires:

- `Schedule-X` ne consomme pas directement la classe Tailwind `.dark`; sa feuille de style utilise `.is-dark`
- Son wrapper React `.sx-react-calendar-wrapper` ne prend pas automatiquement toute la hauteur du container
- Certains elements `Schedule-X` ont un `z-index` superieur a `50`, ce qui faisait passer le calendrier au-dessus du panneau "Nouveau rendez-vous"

## Ordre D'Implementation Recommande

1. Ajouter la table `appointments` dans `supabase/schemas/01_tables.sql`
2. Ajouter le trigger dans `supabase/schemas/04_triggers.sql`
3. Ajouter RLS + policies dans `supabase/schemas/05_policies.sql`
4. Ajouter grants + sequence grants dans `supabase/schemas/06_grants.sql`
5. Generer la migration:
   - `npx supabase db diff --local -f add_appointments`
6. Appliquer la migration:
   - `npx supabase migration up --local`
7. Ajouter les types `Appointment*` dans `src/components/atomic-crm/types.ts`
8. Ajouter les dependances `@schedule-x/*` + `temporal-polyfill`
9. Importer `temporal-polyfill/global` dans `src/main.tsx`
10. Creer le dossier `src/components/atomic-crm/appointments/`
11. Enregistrer `<Resource name="appointments" {...appointments} />` dans `CRM.tsx`
12. Ajouter les entrees de navigation desktop et mobile
13. Ajouter l'integration dans `ContactAside.tsx`
14. Ajuster `sheet.tsx` pour eviter les problemes de superposition
15. Verifier typecheck et build

## Commandes De Validation

- `npm run typecheck`
- `npm run build`

Si vous utilisez le workflow du projet:

- `make typecheck`
- `make build`

## Ce Qui A Ete Ajoute Mais N'Est Pas Necessaire Au Calendrier

Ces ecarts existent bien dans le workspace compare au repo officiel, mais ils ne sont pas requis pour avoir la fonctionnalite calendrier:

- `src/components/atomic-crm/recordings/AudioRecorderDialog.tsx`
- `src/components/atomic-crm/recordings/ContactRecordingsList.tsx`
- `src/components/atomic-crm/recordings/RecordButton.tsx`
- `src/components/atomic-crm/recordings/useAudioRecorder.ts`
- `supabase/functions/transcribe_recording/index.ts`
- `supabase/functions/.env` avec `GEMINI_API_KEY`
- `contact_recordings` ajoute dans:
  - `supabase/schemas/01_tables.sql`
  - `supabase/schemas/04_triggers.sql`
  - `supabase/schemas/05_policies.sql`
  - `supabase/schemas/06_grants.sql`
- `src/components/atomic-crm/contacts/ContactListContent.tsx`
  - Ajout du bouton micro `RecordButton`
- `src/components/atomic-crm/root/CRM.tsx`
  - Ajout du resource `contact_recordings`

Conclusion pratique:

- Si le but est seulement d'ajouter le calendrier, ne reprenez pas la partie `recordings`.
- Vous pouvez ignorer `contact_recordings`, `transcribe_recording`, `GEMINI_API_KEY` et le bouton micro de la liste contacts.

## Ecarts Et Limites De L'Implementation Actuelle

Ces points sont importants si vous voulez reproduire une version propre du feature:

- Aucun fichier de migration n'a encore ete genere dans `supabase/migrations/`
  - La source de verite a ete modifiee, mais la migration n'est pas encore materialisee
- Aucun support FakeRest n'a ete ajoute
  - Il n'y a pas de donnees `appointments` dans `src/components/atomic-crm/providers/fakerest/`
  - Le mode demo / FakeRest n'est donc pas complet pour ce feature
- Aucune traduction i18n `resources.appointments.*` n'a ete ajoutee
  - Le libelle "Calendrier" et plusieurs libelles du formulaire sont en dur
- Aucun test n'a ete ajoute pour le calendrier ou les formulaires appointments
- `.env.development` a ete modifie pour pointer vers une instance Supabase distante
  - Ce changement est local a l'environnement et n'est pas requis pour la fonctionnalite calendrier

## Fichiers A Reprendre Si Vous Voulez Un Portage Minimal Du Calendrier

Portage minimal strict:

- `package.json`
- `package-lock.json`
- `src/main.tsx`
- `src/components/atomic-crm/types.ts`
- `src/components/atomic-crm/root/CRM.tsx`
- `src/components/atomic-crm/layout/Header.tsx`
- `src/components/atomic-crm/layout/MobileNavigation.tsx`
- `src/components/atomic-crm/contacts/ContactAside.tsx`
- `src/components/atomic-crm/appointments/index.tsx`
- `src/components/atomic-crm/appointments/AppointmentList.tsx`
- `src/components/atomic-crm/appointments/AppointmentInputs.tsx`
- `src/components/atomic-crm/appointments/AppointmentCreateSheet.tsx`
- `src/components/atomic-crm/appointments/AppointmentEditSheet.tsx`
- `src/components/atomic-crm/appointments/ContactAppointmentsList.tsx`
- `src/components/atomic-crm/appointments/AddAppointment.tsx`
- `src/components/ui/sheet.tsx`
- `supabase/schemas/01_tables.sql`
- `supabase/schemas/04_triggers.sql`
- `supabase/schemas/05_policies.sql`
- `supabase/schemas/06_grants.sql`

## Resume Court

Pour que le calendrier existe dans Atomic CRM, il faut:

- une table `appointments` cote Supabase
- un resource React-Admin `appointments`
- un module UI `appointments/`
- un point d'entree dans la navigation
- une integration dans la fiche contact
- les dependances `Schedule-X`
- le polyfill `Temporal`
- les correctifs de theme, hauteur et z-index

Le reste du chantier detecte dans le workspace concerne l'audio et la transcription, pas le calendrier.
