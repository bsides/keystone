const omitBy = require('lodash.omitby');
const { flatten, compose, defaultObj } = require('@keystonejs/utils');

/**
 * Format of input object:

  type Query {
    relationships: { <String>: Relationship },
    matchTerm: Object,
    postJoinPipeline: [ Object ],
  }

  type Relationship: {
    from: String,
    field: String,
    many?: Boolean, (default: true)
    ...Query,
  }

  eg;
  {
    relationships: {
      abc123: {
        from: 'posts-collection',
        field: 'posts',
        many: true,
        matchTerm: { title: { $eq: 'hello' } },
        postJoinPipeline: [
          { $limit: 10 },
        ],
        relationships: {
          ...
        },
      },
    },
    matchTerm: { $and: {
      { name: { $eq: 'foobar' } },
      { age: { $eq: 23 } },
      { abc123_posts_some: { $eq: true } }
    },
    postJoinPipeline: [
      { $orderBy: 'name' },
    ],
  }
 */
function mutation(uid, lookupPath) {
  return queryResult => {
    function mutate(arrayToMutate, lookupPathFragment, pathSoFar = []) {
      const [keyToMutate, ...restOfLookupPath] = lookupPathFragment;

      return arrayToMutate.map((value, index) => {
        if (!(keyToMutate in value)) {
          return value;
        }

        if (restOfLookupPath.length === 0) {
          // Now we can execute the mutation
          return omitBy(value, (_, keyToOmit) => keyToOmit.startsWith(uid));
        }

        // Recurse
        return {
          ...value,
          [keyToMutate]: mutate(value[keyToMutate], restOfLookupPath, [
            ...pathSoFar,
            index,
            keyToMutate,
          ]),
        };
      });
    }

    return mutate(queryResult, lookupPath);
  };
}

function mutationBuilder(relationships, path = []) {
  return compose(
    Object.entries(relationships).map(([uid, { relationshipInfo, relationships }]) => {
      const uniqueField = `${uid}_${relationshipInfo.field}`;
      const postQueryMutations = mutationBuilder(relationships, [...path, uniqueField]);
      // NOTE: Order is important. We want depth first, so we perform the related mutators first.
      return compose([postQueryMutations, mutation(uid, [...path, uniqueField])]);
    })
  );
}

function relationshipPipeline([uid, relationship]) {
  const { field, many, from } = relationship.relationshipInfo;
  const uniqueField = `${uid}_${field}`;
  const idsName = `${uniqueField}_id${many ? 's' : ''}`;
  const fieldSize = { $size: `$${uniqueField}` };
  return [
    {
      $lookup: {
        from,
        as: uniqueField,
        // We use `ifNull` here to handle the case unique to mongo where a record may be
        // entirely missing a field (or have the value set to `null`).
        let: { [idsName]: many ? { $ifNull: [`$${field}`, []] } : `$${field}` },
        pipeline: [
          // The ID / list of IDs we're joining by. Do this very first so it limits any work
          // required in subsequent steps / $and's.
          { $match: { $expr: { [many ? '$in' : '$eq']: ['$_id', `$$${idsName}`] } } },
          ...pipelineBuilder(relationship),
        ],
      },
    },
    {
      $addFields: {
        // We use `ifNull` here to handle the case unique to mongo where a record may be
        // entirely missing a field (or have the value set to `null`).
        [`${uniqueField}_every`]: {
          $eq: [fieldSize, many ? { $size: { $ifNull: [`$${field}`, []] } } : 1],
        },
        [`${uniqueField}_none`]: { $eq: [fieldSize, 0] },
        [`${uniqueField}_some`]: { $gt: [fieldSize, 0] },
      },
    },
  ];
}

function pipelineBuilder({ relationships, matchTerm, excludeFields, postJoinPipeline }) {
  return [
    ...flatten(Object.entries(relationships).map(relationshipPipeline)),
    matchTerm && { $match: matchTerm },
    { $addFields: { id: '$_id' } },
    excludeFields && excludeFields.length && { $project: defaultObj(excludeFields, 0) },
    ...postJoinPipeline, // $search / $orderBy / $skip / $first / $count
  ].filter(i => i);
}

module.exports = { pipelineBuilder, mutationBuilder };
