import type { EditorEnvironment } from '../editor/environment';
import type { SpecialAbility } from '../logic/models';
import { pickFile } from './pickFile';
import { specialAbilityFromDrop } from './actorQueries';
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
  pickImage: (current) => pickFile({ type: 'image', current }),
  abilityFromDrop: (data, level) => specialAbilityFromDrop(data as Parameters<typeof specialAbilityFromDrop>[0], level),
  abilityToDropPayload: (ability: SpecialAbility, level) =>
    JSON.stringify({ type: 'Item', data: composeAbilityItemForExport(ability, level), crisprAbilityDrag: true })
};
