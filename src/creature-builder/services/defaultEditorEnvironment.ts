import type { EditorEnvironment } from '../editor/environment';
import type { SpecialAbility } from '../logic/models';
import { customAbilityToSpecialAbility } from '../logic/customAbility';
import { pickFile } from './pickFile';
import { entityFromDropData, type ItemDropData } from './itemDropHandlers';
import { composeAbilityItemForExport } from './abilityItemBuilder';

// CRISPR's default wiring of the editor's Foundry-touching UI ops: notifications via ui.notifications,
// image picking via FilePicker, and the ability drag/drop interop via the existing services.
export const defaultEditorEnvironment: EditorEnvironment = {
  notify: {
    info: (message) => {
      ui.notifications?.info(message);
    },
    warn: (message) => {
      ui.notifications?.warn(message);
    },
    error: (message) => {
      ui.notifications?.error(message);
    }
  },
  confirmDiscard: async () => {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Discard changes?' },
      content: '<p>This creature has unsaved changes. Discard them?</p>',
      yes: { label: 'Discard', icon: 'fa-solid fa-trash' },
      // Default to keeping the work: Enter/Escape resolves to "no", a dismiss to null — both keep editing.
      no: { label: 'Keep editing', icon: 'fa-solid fa-pen' },
      modal: true
    });
    return confirmed === true;
  },
  pickImage: (current) => pickFile({ type: 'image', current }),
  entityFromDrop: (data, level) => entityFromDropData(data as ItemDropData, level),
  abilityToDropPayload: (ability: SpecialAbility, level) =>
    JSON.stringify({ type: 'Item', data: composeAbilityItemForExport(ability, level), crisprAbilityDrag: true }),
  // The slug is the definition's stable identity — picking the same library ability twice dedupes.
  abilityFromDefinition: (def, level) => customAbilityToSpecialAbility(def, level, def.slug),
  enrichHtml: (html) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html)
};
