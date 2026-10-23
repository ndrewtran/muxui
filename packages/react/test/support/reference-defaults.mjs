// The type parameters of a generic part, read back from the shipped declaration by the compiler.
//
// The probes instantiate a generic part at the model's default, which supplies the model's text as the argument:
// a default that is valid but wrong (Text's `'span'` written as `'p'`) instantiates just as well. Here the
// compiler is asked what the declaration itself says: the default and the constraint of each type parameter of the
// part's call signature, compared as types with what the model's text means in the same program. Nothing from the
// model is passed as an argument. The classic TypeScript 6 API is used because it exposes a type parameter's
// default; the declaration says the same to both compilers, which the reader's equality test holds.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript-6';
import { READER_COMPILER_OPTIONS } from '../../reference-reader/host-typescript7.mjs';
import { withStagedPackage } from '../../reference-reader/stage.mjs';
import { qualified, specifierOf } from './reference-probes.mjs';

/**
 * @param {object} options
 * @param {Map<string, any>} options.files The reference files, by name.
 * @param {string[]} options.entries The export-map keys of the typed entries.
 * @returns {{ checked: number, failures: string[] }} The type parameters compared, and every way one differs from the declaration.
 */
export function checkTypeParameters({ files, entries, declarations, manifest }) {
  const namespaces = new Map(entries.map((key, index) => [key, `E${index}`]));
  const lines = entries.map((key) => `import * as ${namespaces.get(key)} from '${specifierOf(key)}';`);
  const parts = [];
  for (const [, file] of files) {
    for (const entry of file.exports) {
      if (entry.kind !== 'component') continue;
      for (const part of entry.parts) {
        if (part.typeParameters === undefined) continue;
        const index = parts.length;
        const label = `${file.owner}:${entry.name}${part.member ? `.${part.member}` : ''}`;
        lines.push(`declare const C${index}: typeof ${namespaces.get(entry.entry)}.${entry.name}${part.member ? `.${part.member}` : ''};`);
        const parameters = part.typeParameters.map((parameter, at) => {
          const named = (text) => {
            // A default or constraint that names another parameter would need the aliases to be generic; none does.
            if (part.typeParameters.some((other) => new RegExp(`\\b${other.name}\\b`, 'u').test(text))) {
              throw new Error(`${label}: ${parameter.name} is defined in terms of a type parameter, which this check does not read`);
            }
            return qualified(text, parameter.refs, file, namespaces);
          };
          const checks = { name: parameter.name };
          if (parameter.default !== undefined) { checks.default = `D${index}_${at}`; lines.push(`type ${checks.default} = ${named(parameter.default)};`); }
          if (parameter.constraint !== undefined) { checks.constraint = `K${index}_${at}`; lines.push(`type ${checks.constraint} = ${named(parameter.constraint)};`); }
          return checks;
        });
        parts.push({ label, index, parameters });
      }
    }
  }

  return withStagedPackage({ declarations, manifest }, ({ directory }) => {
    const path = join(directory, 'type-parameters.ts');
    writeFileSync(path, `${lines.join('\n')}\n`);
    const { options } = ts.convertCompilerOptionsFromJson(READER_COMPILER_OPTIONS, directory);
    const program = ts.createProgram({ rootNames: [path], options });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(path);
    const failures = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
      .map((diagnostic) => `type-parameters.ts: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    const named = new Map(source.statements.flatMap((statement) => {
      if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map((declaration) => [declaration.name.getText(), declaration]);
      if (ts.isTypeAliasDeclaration(statement)) return [[statement.name.text, statement]];
      return [];
    }));
    const text = (type) => checker.typeToString(type);
    const same = (left, right) => left === right || (checker.isTypeAssignableTo(left, right) && checker.isTypeAssignableTo(right, left));
    let checked = 0;
    for (const { label, index, parameters } of parts) {
      const signatures = checker.getTypeAtLocation(named.get(`C${index}`).name).getCallSignatures()
        .filter((signature) => signature.typeParameters?.length === parameters.length);
      if (signatures.length !== 1) {
        failures.push(`${label}: ${signatures.length} call signatures take ${parameters.length} type parameters; expected one`);
        continue;
      }
      parameters.forEach((model, at) => {
        const declared = signatures[0].typeParameters[at];
        for (const [role, declaredType, alias] of [['default', checker.getDefaultFromTypeParameter(declared), model.default], ['constraint', declared.getConstraint(), model.constraint]]) {
          checked += 1;
          const modelType = alias === undefined ? undefined : checker.getTypeFromTypeNode(named.get(alias).type);
          if (declaredType === undefined && modelType === undefined) continue;
          if (declaredType === undefined) failures.push(`${label}: ${model.name} has no ${role} in the declaration, and the model says ${text(modelType)}`);
          else if (modelType === undefined) failures.push(`${label}: ${model.name} has the ${role} ${text(declaredType)} in the declaration, and the model says none`);
          else if (!same(declaredType, modelType)) failures.push(`${label}: ${model.name} has the ${role} ${text(declaredType)} in the declaration, and the model says ${text(modelType)}`);
        }
      });
    }
    return { checked, failures };
  });
}
