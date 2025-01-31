import ts from 'typescript';

import type * as d from '../../declarations';
import { retrieveTsDecorators, retrieveTsModifiers } from './transform-utils';

/**
 * Transformation helper for updating how a Stencil component class is declared.
 *
 * Based on the output module type (CommonJS or ESM), the behavior is slightly different:
 * - For CommonJS, the component class is left as is
 * - For ESM, the component class is re-written as a variable statement
 *
 * @param transformOpts the options provided to TypeScript + Rollup for transforming the AST node
 * @param classNode the node in the AST pertaining to the Stencil component class to transform
 * @param heritageClauses a collection of heritage clauses associated with the provided class node
 * @param members a collection of members attached to the provided class node
 * @param moduleFile the Stencil intermediate representation associated with the provided class node
 * @returns the updated component class declaration
 */
export const updateComponentClass = (
  transformOpts: d.TransformOptions,
  classNode: ts.ClassDeclaration,
  heritageClauses: ts.HeritageClause[] | ts.NodeArray<ts.HeritageClause>,
  members: ts.ClassElement[],
  moduleFile: d.Module
): ts.ClassDeclaration | ts.VariableStatement => {
  let classModifiers = retrieveTsModifiers(classNode)?.slice() ?? [];

  if (transformOpts.module === 'cjs') {
    // CommonJS, leave component class as is

    if (transformOpts.componentExport === 'customelement') {
      // remove export from class - it may already be removed by the TypeScript compiler in certain circumstances if
      // this transformation is run after transpilation occurs
      classModifiers = classModifiers.filter((m) => {
        return m.kind !== ts.SyntaxKind.ExportKeyword;
      });
    }
    return ts.factory.updateClassDeclaration(
      classNode,
      [...(retrieveTsDecorators(classNode) ?? []), ...classModifiers],
      classNode.name,
      classNode.typeParameters,
      heritageClauses,
      members
    );
  }

  // ESM with export
  return createConstClass(transformOpts, classNode, heritageClauses, members, moduleFile);
};

/**
 * Rewrites a component class as a variable statement.
 *
 * After running this function, the following:
 * ```ts
 * class MyComponent {}
 * ```
 * is rewritten as
 * ```ts
 * const MyComponent = class {}
 * ```
 * @param transformOpts the options provided to TypeScript + Rollup for transforming the AST node
 * @param classNode the node in the AST pertaining to the Stencil component class to transform
 * @param heritageClauses a collection of heritage clauses associated with the provided class node
 * @param members a collection of members attached to the provided class node
 * @param moduleFile the Stencil intermediate representation associated with the provided class node
 * @returns the component class, re-written as a variable statement
 */
const createConstClass = (
  transformOpts: d.TransformOptions,
  classNode: ts.ClassDeclaration,
  heritageClauses: ts.HeritageClause[] | ts.NodeArray<ts.HeritageClause>,
  members: ts.ClassElement[],
  moduleFile: d.Module
): ts.VariableStatement => {
  const className = classNode.name;

  const classModifiers = (retrieveTsModifiers(classNode) ?? []).filter((m) => {
    // remove the export - it may already be removed by the TypeScript compiler in certain circumstances if this
    // transformation is run after transpilation occurs
    return m.kind !== ts.SyntaxKind.ExportKeyword;
  });

  const constModifiers: ts.Modifier[] = [];

  if (
    transformOpts.componentExport !== 'customelement' &&
    !moduleFile.cmps.some((cmp) => cmp.hasStaticInitializedMember)
  ) {
    constModifiers.push(ts.factory.createModifier(ts.SyntaxKind.ExportKeyword));
  }

  return ts.factory.createVariableStatement(
    constModifiers,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          className,
          undefined,
          undefined,
          ts.factory.createClassExpression(
            classModifiers,
            undefined,
            classNode.typeParameters,
            heritageClauses,
            members
          )
        ),
      ],
      ts.NodeFlags.Const
    )
  );
};
