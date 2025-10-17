import {
  cacheQuery,
  type Entity,
  type QueryHash,
  type QueryModifier,
  type QueryResult,
  type Trait,
  type World
} from "koota";


export type QueryFilter = (
  parents: number[],
  children: number[],
  world: World,
  skipCollectingChildren?: boolean
) => {
  parents: number[];
  children: number[];
};
export type QueryFilterNode = {
  components: Trait[];
  queryFilter: QueryFilter;
  childQueries: QueryFilterNode[];
  isFilter: true;
};

export type QueryTree = Array<QueryFilterNode | Trait>;

/**
 *
 * @param queryTree - a (potentially nested) array of components and query filters.
 *  <pre>
 *   Examples:
 *
 *   1) Create a query for all entities with component 'Foo' that also
 *   have a child with the Component 'Bar'.
 *
 *
 *   const myTreeQuery = createTreeQuery(Foo, SomeChild(Bar));
 *   -----------------------------------------------------------------
 *
 *   2) Create a query for all entities with the component set [A, B] that
 *   have a child that match the component set [C, D],
 *
 *
 *   const myTreeQuery = createTreeQuery(A, B, SomeChild(C, D));
 *   -----------------------------------------------------------------
 *
 *   3) Nesting: Create a query for all entities with the component A that
 *   have a child that has component B *and* in turn has a child
 *   with component C.
 *
 *
 *   const myTreeQuery = createTreeQuery(
 *    A, SomeChild(
 *      B, SomeChild(
 *        C
 *      )
 *    )
 *   );
 *   -----------------------------------------------------------------
 * </pre>
 */
export function createTreeQuery(...queryTree: QueryTree) {
  if (queryTree.length === 0) {
    throw `createTreeQuery: Tree query empty`;
  }

  // This function builds a tree query, the building process is about 200 lines long,
  // checkout the return value of this function to see what gets returned and executed
  // as the final tree query.

  // Rough overview of query build algorithm:
  // traverse the expression tree
  //  save all the regular queries for later evaluation
  //  save the filter functions to compare parent query with the child query
  // build tree structure to loop over when executing
  // flatten tree

  // Rough overview of the query execution algorithm:
  // For each node (in reverse depth-first tree traversal order)
  //  execute the parent ecs query and save the result
  //  For each (parent, child) pair
  //    reduce both child and parent list by filtering(parentEids, childEids)
  //    early out if any intermediate result is empty
  // Return the list of root query eids that are left 

  // -------------------------------------------------------------------------------------------------------------------
  // Some function internal helper types

  type WipQuery = {
    components: Trait[];
    id: number;
  };

  type QueryTuple = {
    parent: WipQuery;
    child: WipQuery;
  };

  type EvalNode = {
    id: number;
    children: Array<{ edge: EvalEdge; node: EvalNode }>;
    query: QueryHash<any>;
    updateList: QueryResult;
  };

  type EvalEdge = {
    filter: any;
    parentNode: EvalNode;
    childNode: EvalNode;
  };
  // -------------------------------------------------------------------------------------------------------------------

  // No real chance to generate the same random number twice, just to make sure, if the id already exists we just
  // create a new one (a simple counter could have worked, but it was annoying to get right
  // from within the recursive build algorithm) – not used after build is done.
  const genId = (() => {
    const prevIds = new Set<number>();
    const genSafeId = (): number => {
      const newId = Math.random();
      if (prevIds.has(newId)) return genSafeId();
      else return newId;
    };
    return genSafeId;
  })();

  // -------------------------------------------------------------------------------------------------------------------

  // Let query construction begin:

  const filterWithTuple: Array<[QueryFilter, QueryTuple]> = [];
  const finalQueries: WipQuery[] = [];
  const childQueryObjects: {
    children: QueryFilterNode[];
    queryObject: { id: number; components: Trait[] };
  }[] = [];
  const nodeStore = new Map<number, EvalNode>();

  const buildQueryRecursive = (
    query: QueryTree,
    foundNodeComponents: boolean,
    parentQueryObject: any
  ) => {
    childQueryObjects.length = 0;

    const parentQueryPassed = !!parentQueryObject;
    const nextParentQuery: { id: number; components: Trait[] } = parentQueryObject ?? {
      id: genId(),
      components: [],
    };
    const queryLen = query.length;
    let nextNodeFind = false;

    for (let idx = 0; idx < queryLen; idx++) {
      const node = query[idx];

      // node is the result of a filter node
      if ((node as QueryFilterNode).isFilter) {
        const {queryFilter} = node as QueryFilterNode;
        nextNodeFind = nextNodeFind || (node as QueryFilterNode).components.length > 0;

        // create the raw query
        const nextChildQuery = {
          id: genId(),
          components: (node as QueryFilterNode).components,
        };

        finalQueries.push(nextChildQuery);

        if ((node as QueryFilterNode).childQueries.length > 0) {
          // there are children left
          childQueryObjects.push({
            children: (node as QueryFilterNode).childQueries,
            queryObject: nextChildQuery,
          });
        }

        filterWithTuple.push([
          queryFilter,
          {
            parent: nextParentQuery,
            child: nextChildQuery,
          },
        ]);
      }

      // node is regular component
      else {
        nextParentQuery.components.push(node as Trait);
      }
    }

    if (nextParentQuery.components.length === 0 && queryLen > 0 && !foundNodeComponents) {
      nextParentQuery.id = genId();
      finalQueries.push(nextParentQuery);
    }
    // ~
    else if (nextParentQuery.components.length > 0 && !parentQueryPassed) {
      finalQueries.push(nextParentQuery);
    }

    // after we've sorted out components and children, we continue with the children
    for (const {children: _children, queryObject} of childQueryObjects) {
      buildQueryRecursive(_children, nextNodeFind, queryObject);
    }
  };

  // -------------------------------------------------------------------------------------------------------------------

  buildQueryRecursive(queryTree, false, null);

  // -------------------------------------------------------------------------------------------------------------------

  // Create all pure ecs queries
  const queryById = new Map<number, QueryHash<any>>();
  for (const {id, components} of finalQueries) {
    const hash = cacheQuery(...components); // Since Koota eval's queries on demand (or accepts a query hash), we hash here
    queryById.set(id, hash);
  }

  if (filterWithTuple.length === 0) {
    throw new Error(`createTreeQuery: Your Tree Query contains no filter - use a regular query instead.`);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Use all the created queries and build a tree structure

  const rootId = filterWithTuple[0][1].parent.id;

  for (const [filter, tuple] of filterWithTuple) {
    const {parent, child} = tuple;
    const childQuery = queryById.get(child.id)!;
    const parentQuery = queryById.get(parent.id)!;

    let parentNode = nodeStore.get(parent.id);
    if (!parentNode) {
      parentNode = {
        id: parent.id,
        query: parentQuery,
        children: [],
        updateList: [] as unknown as QueryResult,
      };
      nodeStore.set(parent.id, parentNode!);
    }

    let childNode = nodeStore.get(child.id);
    if (!childNode) {
      childNode = {
        id: child.id,
        query: childQuery,
        children: [],
        updateList: [] as unknown as QueryResult,
      };

      const edge = {
        filter,
        parentNode,
        childNode,
      };
      parentNode.children.push({
        edge,
        node: childNode,
      });

      nodeStore.set(child.id, childNode);
    }
  }

  // -------------------------------------------------------------------------------------------------------------------

  // Final preparation for the query execution function. We build the final data structure (flat linear array)
  // iterated over in execution and prepare some reusable data containers to avoid unnecessary creation during execution

  const rootNode = nodeStore.get(rootId);
  // we expect this to never happen, but in case it does, better to throw an error at build time than run time
  if (!rootNode) {
    throw new Error(`createTreeQuery: Unexpected failure when creating Tree Query. Please report/investigate.`);
  }

  // These scoped data structures will be re-used when executing the query
  const edgesFlattened: EvalEdge[] = [];
  const queriesComputed = new Set<EvalNode>();
  const emptyResultsArr: never[] = [];
  // -------------------------------------------------------------------------------------------------------------------

  // Turning the tree structure into flat traversal list for fast execution.
  // For this we traverse the nodes in depth-first order and store the edges between.
  // The edges are what we'll actually need at execution time.
  const nodeStack: EvalNode[] = [rootNode];
  while (nodeStack.length > 0) {
    const node = nodeStack.pop()!;
    for (const child of node.children) {
      nodeStack.push(child.node);
      edgesFlattened.push(child.edge);
    }
  }

  // small clean up for data that we definitely won't need anymore - just to give the GC a friendly hint :-)
  nodeStore.clear();
  queryById.clear();
  finalQueries.length = 0;
  filterWithTuple.length = 0;
  childQueryObjects.length = 0;
  nodeStack.length = 0;

  // ------
  // we need to reverse traversal order to start at the innermost query
  // (otherwise we'd have to update previous results)
  edgesFlattened.reverse();
  // ------

  
  // ===================================================================================================================
  // The final runtime function:
  // This is what gets called when we execute a generated query.

  return (world: World) => {
    // We need to execute all the queries, and we need to perform all the filter actions.
    // We execute all queries once, then we're safe and can re-use arrays to narrow results down
    queriesComputed.clear();
    emptyResultsArr.length = 0;

    for (let i = 0, N = edgesFlattened.length; i < N; i++) {
      const {filter, parentNode, childNode} = edgesFlattened[i];

      // We make sure each query has been called at least once!
      if (!queriesComputed.has(parentNode)) {
        parentNode.updateList = world.query(parentNode.query);
        queriesComputed.add(parentNode);
      }
      if (!queriesComputed.has(childNode)) {
        childNode.updateList = world.query(childNode.query);
        queriesComputed.add(childNode);
      }
      // -----------------------------------------------------

      // filter down the results - the filter enforces the relationship between the two sets of entities
      const {parents, children} = filter(
        parentNode.updateList,
        childNode.updateList,
        world,
        childNode.children.length === 0
      );

      // if any of the two are empty we already know that the final intersection
      // of all entities will be empty and can return early.
      if (parents.length === 0 || children.length === 0) {
        return emptyResultsArr;
      }

      // from now on we work with the updated lists, this way we
      // don't compare any entities that have already been discarded
      parentNode.updateList = parents;
      childNode.updateList = children;
    }

    return rootNode.updateList;
  };

  // ===================================================================================================================
}


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

    // @ts-ignore: forgot what TS was complaining about here
    return {components: _components, queryFilter, childQueries, isFilter: true};
  };
}
