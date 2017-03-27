///<reference path="app/headers/common.d.ts" />

import _ from 'lodash';
import extraFunctions from './query_part_funcs';

var index = {};
var categories = {
  Aggregations: [],
  Selectors: [],
  Math: [],
  Transform: [],
  Aliasing: [],
  Fields: [],
};

class QueryPartDef {
  type: string;
  params: any[];
  defaultParams: any[];
  renderer: any;
  category: any;
  addStrategy: any;
  dbms: any[];

  constructor(options: any) {
    this.type = options.type;
    this.params = options.params;
    this.defaultParams = options.defaultParams;
    this.renderer = options.renderer;
    this.category = options.category;
    this.addStrategy = options.addStrategy;
    this.dbms = options.dbms;
  }

  static register(options: any) {
    if (index[options.type]) {
      return;
    }
    index[options.type] = new QueryPartDef(options);
    options.category.push(index[options.type]);
  }
}

function functionRenderer(part, innerExpr) {
  var str = part.def.type + '(';
  var parameters = _.map(part.params, (value, index) => {
    var paramType = part.def.params[index];
    if (paramType.type === 'time') {
      if (value === 'auto') {
        value = '$interval';
      }
    }
    if (paramType.quote === 'single') {
      return "'" + value + "'";
    } else if (paramType.quote === 'double') {
      return '"' + value + '"';
    }
    return value;
  });

  if (innerExpr) {
    parameters.unshift(innerExpr);
  }
  return str + parameters.join(', ') + ')';
}

function parametricFunctionRenderer(part, innerExpr) {
  var str = part.def.type;
  var parameters = _.map(part.params, (value, index) => {
    var paramType = part.def.params[index];
    if (paramType.type === 'time') {
      if (value === 'auto') {
        value = '$interval';
      }
    }
    if (paramType.quote === 'single') {
      return "'" + value + "'";
    } else if (paramType.quote === 'double') {
      return '"' + value + '"';
    }
    return value;
  });

  if (innerExpr) {
    parameters.unshift(innerExpr);
  }
  return str + '(' + parameters.pop() + ')(' + parameters.join(', ') + ')';
}

function aliasRenderer(part, innerExpr) {
  return innerExpr + ' AS `' + part.params[0] + '`';
}

function suffixRenderer(part, innerExpr) {
  return innerExpr + ' ' + part.params[0];
}

function identityRenderer(part, innerExpr) {
  return part.params[0];
}

function quotedIdentityRenderer(part, innerExpr) {
  return '"' + part.params[0] + '"';
}

function fieldRenderer(part, innerExpr) {
  return part.params[0];
}

function replaceAggregationAddStrategy(selectParts, partModel) {
  // look for existing aggregation
  for (var i = 0; i < selectParts.length; i++) {
    var part = selectParts[i];
    if (part.def.category === categories.Aggregations) {
      selectParts[i] = partModel;
      return;
    }
    if (part.def.category === categories.Selectors) {
      selectParts[i] = partModel;
      return;
    }
  }

  selectParts.splice(1, 0, partModel);
}

function addMathStrategy(selectParts, partModel) {
  var partCount = selectParts.length;
  if (partCount > 0) {
    // if last is math, replace it
    if (selectParts[partCount-1].def.type === 'math') {
      selectParts[partCount-1] = partModel;
      return;
    }
    // if next to last is math, replace it
    if (selectParts[partCount-2].def.type === 'math') {
      selectParts[partCount-2] = partModel;
      return;
    } else if (selectParts[partCount-1].def.type === 'alias') { // if last is alias add it before
      selectParts.splice(partCount-1, 0, partModel);
      return;
    }
  }
  selectParts.push(partModel);
}

function addAliasStrategy(selectParts, partModel) {
  var partCount = selectParts.length;
  if (partCount > 0) {
    // if last is alias, replace it
    if (selectParts[partCount-1].def.type === 'alias') {
      selectParts[partCount-1] = partModel;
      return;
    }
  }
  selectParts.push(partModel);
}

function addFieldStrategy(selectParts, partModel, query) {
  // copy all parts
  var parts = _.map(selectParts, function(part: any) {
    return new QueryPart({type: part.def.type, params: _.clone(part.params)});
  });

  query.selectModels.push(parts);
}

function addTransformStrategy(selectParts, partModel) {
  var partCount = selectParts.length;
  if (partCount > 0) {
    // if last is alias add it before
    if (selectParts[partCount-1].def.type === 'alias') {
      selectParts.splice(partCount-1, 0, partModel);
      return;
    }
  }
  selectParts.push(partModel);
}

// Defaults
var partRenderer = {
  functionRenderer: functionRenderer,
  parametricFunctionRenderer: parametricFunctionRenderer,
  aliasRenderer: aliasRenderer,
  suffixRenderer: suffixRenderer,
  identityRenderer: identityRenderer,
  quotedIdentityRenderer: quotedIdentityRenderer,
  fieldRenderer: fieldRenderer
}

var partDefault = {
  Aggregations: {
    addStrategy: replaceAggregationAddStrategy,
    category: categories.Aggregations,
    params: [],
    defaultParams: [],
    renderer: functionRenderer,
  },
  Selectors: {
    addStrategy: replaceAggregationAddStrategy,
    category: categories.Selectors,
    params: [],
    defaultParams: [],
    renderer: functionRenderer,
  },
  Transform: {
    addStrategy: addTransformStrategy,
    renderer: functionRenderer,
    params: [],
    defaultParams: [],
    category: categories.Transform,
  },
};

QueryPartDef.register({
  type: 'field',
  addStrategy: addFieldStrategy,
  category: categories.Fields,
  params: [{type: 'field', dynamicLookup: true}],
  defaultParams: ['value'],
  renderer: fieldRenderer,
});

// Aggregations
QueryPartDef.register(_.assign({}, partDefault.Aggregations, { type: 'count' }));
QueryPartDef.register(_.assign({}, partDefault.Aggregations, { type: 'avg' }));
QueryPartDef.register(_.assign({}, partDefault.Aggregations, { type: 'sum' }));
QueryPartDef.register(_.assign({}, partDefault.Aggregations, { type: 'median' }));

// transformations

QueryPartDef.register(_.assign({}, partDefault.Transform, {
  type: 'time',
  params: [{ name: "interval", type: "time", options: ['auto', '1s', '10s', '1m', '5m', '10m', '15m', '1h'] }],
  defaultParams: ['auto'],
}));

// Selectors

QueryPartDef.register(_.assign({}, partDefault.Selectors, { type: 'max' }));
QueryPartDef.register(_.assign({}, partDefault.Selectors, { type: 'min' }));

QueryPartDef.register({
  type: 'tag',
  category: categories.Fields,
  params: [{name: 'tag', type: 'string', dynamicLookup: true}],
  defaultParams: ['tag'],
  renderer: fieldRenderer,
});

QueryPartDef.register({
  type: 'math',
  addStrategy: addMathStrategy,
  category: categories.Math,
  params: [{ name: "expr", type: "string"}],
  defaultParams: [' / 100'],
  renderer: suffixRenderer,
});

QueryPartDef.register({
  type: 'alias',
  addStrategy: addAliasStrategy,
  category: categories.Aliasing,
  params: [{ name: "name", type: "string", quote: 'double'}],
  defaultParams: ['alias'],
  renderMode: 'suffix',
  renderer: aliasRenderer,
});

// Include dbms specific functions
_.each(extraFunctions, (functionCategories, dbms) => {
  _.each(functionCategories, (functions, category) => {
    /* Break to category and subcategory */
    var catItem = category.split('_');
    var categorySub = null;
    if (catItem[1]) {
      if (!categories[catItem[1]]) {
        categories[catItem[1]] = [];
      }
      categorySub = categories[catItem[1]];
    }
    var defaults = partDefault[catItem[0]];
    /* Register all function specs with updated defaults */
    _.each(functions, spec => {
      if (spec.renderer) {
        spec.renderer = partRenderer[spec.renderer];
      }
      if (categorySub) {
        spec.category = categorySub;
      }
      spec.dbms = dbms;
      /* Update defaults, the object allocations are kind
         of sluggish here, so let's make it less pretty */
      for (var k in defaults) {
        if (spec[k] === undefined) {
          spec[k] = defaults[k];
        }
      }
      QueryPartDef.register(spec);
    });
  });
});

class QueryPart {
  part: any;
  def: QueryPartDef;
  params: any[];
  text: string;

  constructor(part: any) {
    this.part = part;
    this.def = index[part.type];
    if (!this.def) {
      throw {message: 'Could not find query part ' + part.type};
    }

    part.params = part.params || _.clone(this.def.defaultParams);
    this.params = part.params;
    this.updateText();
  }

  render(innerExpr: string) {
    return this.def.renderer(this, innerExpr);
  }

  hasMultipleParamsInString (strValue, index) {
    if (strValue.indexOf(',') === -1) {
      return false;
    }

    return this.def.params[index + 1] && this.def.params[index + 1].optional;
  }

  updateParam (strValue, index) {
    // handle optional parameters
    // if string contains ',' and next param is optional, split and update both
    if (this.hasMultipleParamsInString(strValue, index)) {
      _.each(strValue.split(','), function(partVal: string, idx) {
        this.updateParam(partVal.trim(), idx);
      }, this);
      return;
    }

    if (strValue === '' && this.def.params[index].optional) {
      this.params.splice(index, 1);
    } else {
      this.params[index] = strValue;
    }

    this.part.params = this.params;
    this.updateText();
  }

  updateText() {
    if (this.params.length === 0) {
      this.text = this.def.type + '()';
      return;
    }

    var text = this.def.type + '(';
    text += this.params.join(', ');
    text += ')';
    this.text = text;
  }
}

export default {
  create: function(part): any {
    return new QueryPart(part);
  },

  getCategories: function() {
    return categories;
  },

  getMatchOperators: function(dbms) {
    var rtn = null;
    switch (dbms) {
      case 'postgres':
        rtn = { 'match': '~*', 'not': '!~*' };
        break;
      case 'mysql':
        rtn = { 'match': 'REGEXP', 'not': 'NOT REGEXP' };
        break;
      case 'clickhouse':
        rtn = { 'match': 'LIKE', 'not': 'NOT LIKE' };
        break;
      default:
        break;
    };

    return rtn;
  },
};
