import {type Entity, type QueryModifier, type Trait, type World} from 'koota';
import {type QueryFilter, type QueryFilterNode} from './tree-query';

/**
 * factory function for tree query filters to be used with `createTreeQuery`.
 * Pass a condition that works out whether to include an entity in the parent query by
 * comparing it with entities in the child query.
 * <pre>
 *   Example:
 *
 *   const SomeChild = createTreeQueryFilter((parentEid, childEid, world) => {
 *      const child = world.getEntity(childEid)!;
 *      return (child.parent?.getEntityId() === parentEid);
 *   })
 *  </pre>
 * @param condition
 */
export function createTreeQueryFilter<W extends World = World>(
  condition: (eid: Entity, nestedEid: Entity, world: W) => boolean
) {
  return function (...traits: Array<Trait | QueryModifier | QueryFilterNode>): {
    components: Trait[];
    queryFilter: QueryFilter;
    childQueries: QueryFilterNode[];
    isFilter: true;
  } {
    // --------------------------------------------------------------------------------------
    // we filter out further modifier and return them separate from the components
    const _components: Trait[] = [];
    const childQueries: QueryFilterNode[] = [];

    if (!Array.isArray(traits)) {
      throw `createTreeQueryFilter: traits need to be passed as an array.`;
    }

    for (const trait of traits) {
      if (Array.isArray(trait)) {
        throw `createTreeQueryFilter: Syntax error creating while creating a Tree Query. Component Arrays can only contain Components or Filter Functions.`;
      }
      if ((trait as unknown as QueryFilterNode).isFilter) {
        childQueries.push(trait as unknown as QueryFilterNode);
      } else {
        _components.push(trait as Trait);
      }
    }
    // --------------------------------------------------------------------------------------

    const queryFilter = (
      parents: Entity[],
      children: Entity[],
      world: W,
      skipCollectingChildren = false
    ) => {
      const parents2: number[] = [];
      const children2: number[] = [];

      for (let i = 0; i < parents.length; i++) {
        const parentEid = parents[i];
        let someChildMatches = false;

        // we need to find one child that matches the filter condition
        for (let j = 0, N = children.length; j < N; j++) {
          const childEid = children[j];
          // The matching function that gets passed by the user when creating new filter functions
          // ~~~
          const match = condition(parentEid, childEid, world);
          // ~~~
          someChildMatches = someChildMatches || match;
          if (match) {
            children2.push(childEid);
            // The skipCollectingChildren parameter determines if we should keep
            // collecting children or if it's better to break out early. If there
            // is not going to be another child query of this children array, then
            // we don't need to continue collecting.
            if (skipCollectingChildren) break;
          }
        }

        if (someChildMatches) {
          parents2.push(parentEid);
        }
      }
      return {parents: parents2, children: children2};
    };

    // @ts-ignore
    return {components: _components, queryFilter, childQueries, isFilter: true};
  };
}