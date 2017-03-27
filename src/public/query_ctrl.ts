///<reference path="app/headers/common.d.ts" />

import './query_part_editor';

import angular from 'angular';
import _ from 'lodash';
import SqlQueryBuilder from './query_builder';
import SqlQuery from './sql_query';
import queryPart from './query_part';
import {QueryCtrl} from 'app/plugins/sdk';

export class SqlQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';

  queryModel: SqlQuery;
  queryBuilder: any;
  resultFormats: any[];
  schemaSegment: any;
  timeColDataTypeSegment: any;
  dateColDataTypeSegment: any;
  tagSegments: any[];
  selectMenu: any;
  groupByMenu: any;
  tableSegment: any;
  removeTagFilterSegment: any;
  matchOperators: any;
  panel: any;
  datasource: any;
  target: any;

  /** @ngInject **/
  constructor($scope, $injector, private templateSrv, private $q, private uiSegmentSrv) {
    super($scope, $injector);

    this.target = this.target;

    this.matchOperators = queryPart.getMatchOperators(this.datasource.dbms);

    this.queryModel = new SqlQuery(this.target, templateSrv, this.panel.scopedVars);
    this.queryModel.dbms = this.datasource.dbms;
    this.queryBuilder = new SqlQueryBuilder(
      this.target, this.datasource.dbms, { matchOperators: this.matchOperators }
    );

    this.resultFormats = [
      {text: 'Time series', value: 'time_series'},
      {text: 'Table', value: 'table'},
      {text: 'Docs', value: 'docs'},
    ];

    this.schemaSegment = uiSegmentSrv.newSegment(
      this.target.schema || {fake: true, value: '-- schema --'}
    );

    this.tableSegment = uiSegmentSrv.newSegment(
      this.target.table || {fake: true, value: '-- table --'}
    );

    this.timeColDataTypeSegment = uiSegmentSrv.newSegment(
      this.target.timeColDataType || {fake: true, value: '-- time : type --'}
    );

    this.dateColDataTypeSegment = uiSegmentSrv.newSegment(
      this.target.dateColDataType || {value: 'date : Date'}
    );

    this.tagSegments = [];
    for (let tag of this.target.tags) {
      if (!tag.operator) {
        if (/^\/.*\/$/.test(tag.value)) {
          tag.operator = this.matchOperators.match;
        } else {
          tag.operator = '=';
        }
      }

      if (tag.condition) {
        this.tagSegments.push(uiSegmentSrv.newCondition(tag.condition));
      }

      this.tagSegments.push(uiSegmentSrv.newKey(tag.key));
      this.tagSegments.push(uiSegmentSrv.newOperator(tag.operator));
      this.tagSegments.push(uiSegmentSrv.newKeyValue(tag.value));
    }

    this.fixTagSegments();
    this.selectMenu = this.buildSelectMenu();
    this.groupByMenu = _.filter(this.selectMenu, e => {
      return e.text != 'Aggregations' && e.text != 'Selectors';
    });
    this.removeTagFilterSegment = uiSegmentSrv.newSegment({
      fake: true, value: '-- remove tag filter --'
    });
  }

  /*
  setDefault() {
    var query = this.queryBuilder.buildExploreQuery('SET_DEFAULT');
    this.datasource._seriesQuery(query).then(data => {
      if (!data.results[0].series[0].values) { return; }
      var result = data.results[0].series[0].values[0];
      this.target.schema          = result[0];
      this.target.table           = result[1];
      this.target.timeColDataType = result[2];

      this.schemaSegment = this.uiSegmentSrv.newSegment(this.target.schema);
      this.tableSegment = this.uiSegmentSrv.newSegment(this.target.table);
      this.timeColDataTypeSegment = this.uiSegmentSrv.newSegment(this.target.timeColDataType);
    });
  }
  */

  buildSelectMenu() {
    var dbms = this.queryModel.dbms;
    var categories = queryPart.getCategories();
    return _.reduce(categories, function(memo, cat, key) {
      var menu = {
        text: key,
        submenu: cat
          .filter(item => { return !item.dbms || item.dbms == dbms; })
          .map(item => { return {text: item.type, value: item.type}; })
      };
      if (menu.submenu.length > 0) {
        memo.push(menu);
      }
      return memo;
    }, []);
  }

  getGroupByOptions(part) {
    var query = this.queryBuilder.buildExploreQuery('TAG_KEYS');

    return this.datasource.metricFindQuery(query).then(tags => {
      var options = [];
      if (!this.queryModel.hasGroupByTime()) {
        options.push(this.uiSegmentSrv.newSegment({value: 'time($interval)'}));
      }
      for (let tag of tags) {
        options.push(this.uiSegmentSrv.newSegment({value: 'tag(' + tag.text + ')'}));
      }
      return options;
    }).catch(this.handleQueryError.bind(this));

  }

  addGroupByPart(cat, subitem) {
    this.queryModel.addGroupBy(subitem.value);
    this.panelCtrl.refresh();
  }

  removeGroupByPart(part, index) {
    this.queryModel.removeGroupByPart(part, index);
    this.panelCtrl.refresh();
  }

  addSelectPart(selectParts, cat, subitem) {
    this.queryModel.addSelectPart(selectParts, subitem.value);
    this.panelCtrl.refresh();
  }

  removeSelectPart(selectParts, part) {
    this.queryModel.removeSelectPart(selectParts, part);
    this.panelCtrl.refresh();
  }

  selectPartUpdated() {
    this.panelCtrl.refresh();
  }

  fixTagSegments() {
    var count = this.tagSegments.length;
    var lastSegment = this.tagSegments[Math.max(count-1, 0)];

    if (!lastSegment || lastSegment.type !== 'plus-button') {
      this.tagSegments.push(this.uiSegmentSrv.newPlusButton());
    }
  }

  tableChanged() {
    this.target.table = this.tableSegment.value;
    this.panelCtrl.refresh();
  }

  getSchemaSegments() {
    var schemasQuery = this.queryBuilder.buildExploreQuery('SCHEMA');
    return this.datasource.metricFindQuery(schemasQuery)
    .then(this.transformToSegments(false))
    .catch(this.handleQueryError.bind(this));
  }

  schemaChanged() {
    this.target.schema = this.schemaSegment.value;
    this.panelCtrl.refresh();
  }

  getTimeColDataTypeSegments() {
    var timeColQuery = this.queryBuilder.buildExploreQuery('FIELDS');
    return this.datasource.metricFindQuery(timeColQuery)
    .then(this.transformToSegments(false))
    .catch(this.handleQueryError.bind(this));
  }

  timeColDataTypeChanged() {
    this.target.timeColDataType = this.timeColDataTypeSegment.value;
    this.panelCtrl.refresh();
  }

  dateColDataTypeChanged() {
    this.target.dateColDataType = this.dateColDataTypeSegment.value;
    this.panelCtrl.refresh();
  }

  toggleEditorMode() {
    try {
      this.target.query = this.queryModel.render(false);
    } catch (err) {
      console.log('query render error');
    }
    this.target.rawQuery = !this.target.rawQuery;
  }

  getTableSegments() {
    var query = this.queryBuilder.buildExploreQuery('TABLES');
    return this.datasource.metricFindQuery(query)
      .then(this.transformToSegments(true))
      .catch(this.handleQueryError.bind(this));
  }

  getPartOptions(part) {
    var fieldsQuery = this.queryBuilder.buildExploreQuery('TAG_KEYS');
    return this.datasource.metricFindQuery(fieldsQuery)
    .then(this.transformToSegments(true))
    .catch(this.handleQueryError.bind(this));
  }

  handleQueryError(err) {
    this.error = err.message || 'Failed to issue metric query';
    return [];
  }

  transformToSegments(addTemplateVars) {
    return (results) => {
      var segments = _.map(results, segment => {
        return this.uiSegmentSrv.newSegment({ value: segment.text, expandable: segment.expandable });
      });

      if (addTemplateVars) {
        for (let variable of this.templateSrv.variables) {
          segments.unshift(this.uiSegmentSrv.newSegment({
            type: 'template', value: '/^$' + variable.name + '$/', expandable: true
          }));
          segments.unshift(this.uiSegmentSrv.newSegment({
            type: 'template', value: '$' + variable.name, expandable: true
          }));
        }
      }

      return segments;
    };
  }

  getTagsOrValues(segment, index) {
    if (segment.type === 'condition') {
      return this.$q.when([
        this.uiSegmentSrv.newSegment('AND'), this.uiSegmentSrv.newSegment('OR')
      ]);
    }
    if (segment.type === 'operator') {
      var nextValue = this.tagSegments[index+1].value;
      if (/^\/.*\/$/.test(nextValue)) {
        return this.$q.when(this.uiSegmentSrv.newOperators([
          this.matchOperators.match, this.matchOperators.not
        ]));
      } else {
        return this.$q.when(this.uiSegmentSrv.newOperators([
          '=', '<>', '<', '<=', '>', '>=', 'IN', 'NOT IN', 'LIKE', 'NOT LIKE'
        ]));
      }
    }

    var query, addTemplateVars;
    if (segment.type === 'key' || segment.type === 'plus-button') {
      query = this.queryBuilder.buildExploreQuery('TAG_KEYS');
      addTemplateVars = false;
    } else if (segment.type === 'value')  {
      query = this.queryBuilder.buildExploreQuery('TAG_VALUES', this.tagSegments[index-2].value);
      addTemplateVars = true;
    }

    return this.datasource.metricFindQuery(query)
    .then(this.transformToSegments(addTemplateVars))
    .then(results => {
      if (segment.type === 'key') {
        results.splice(0, 0, angular.copy(this.removeTagFilterSegment));
      }
      return results;
    })
    .catch(this.handleQueryError.bind(this));
  }

  getFieldSegments() {
    var fieldsQuery = this.queryBuilder.buildExploreQuery('TAG_KEYS');
    return this.datasource.metricFindQuery(fieldsQuery)
    .then(this.transformToSegments(false))
    .catch(this.handleQueryError);
  }

  tagSegmentUpdated(segment, index) {
    this.tagSegments[index] = segment;

    // handle remove tag condition
    if (segment.value === this.removeTagFilterSegment.value) {
      this.tagSegments.splice(index, 3);
      if (this.tagSegments.length === 0) {
        this.tagSegments.push(this.uiSegmentSrv.newPlusButton());
      } else if (this.tagSegments.length > 2) {
        this.tagSegments.splice(Math.max(index-1, 0), 1);
        if (this.tagSegments[this.tagSegments.length-1].type !== 'plus-button') {
          this.tagSegments.push(this.uiSegmentSrv.newPlusButton());
        }
      }
    } else {
      if (segment.type === 'plus-button') {
        if (index > 2) {
          this.tagSegments.splice(index, 0, this.uiSegmentSrv.newCondition('AND'));
        }
        this.tagSegments.push(this.uiSegmentSrv.newOperator('='));
        this.tagSegments.push(this.uiSegmentSrv.newFake(
          'select tag value', 'value', 'query-segment-value'
        ));
        segment.type = 'key';
        segment.cssClass = 'query-segment-key';
      }

      if ((index+1) === this.tagSegments.length) {
        this.tagSegments.push(this.uiSegmentSrv.newPlusButton());
      }
    }

    this.rebuildTargetTagConditions();
  }

  rebuildTargetTagConditions() {
    var tags = [];
    var tagIndex = 0;
    var tagOperator = "";

    _.each(this.tagSegments, (segment2, index) => {
      if (segment2.type === 'key') {
        if (tags.length === 0) {
          tags.push({});
        }
        tags[tagIndex].key = segment2.value;
      } else if (segment2.type === 'value') {
        tagOperator = this.getTagValueOperator(segment2.value, tags[tagIndex].operator);
        if (tagOperator) {
          this.tagSegments[index-1] = this.uiSegmentSrv.newOperator(tagOperator);
          tags[tagIndex].operator = tagOperator;
        }
        tags[tagIndex].value = segment2.value;
      } else if (segment2.type === 'condition') {
        tags.push({ condition: segment2.value });
        tagIndex += 1;
      } else if (segment2.type === 'operator') {
        tags[tagIndex].operator = segment2.value;
      }
    });

    this.target.tags = tags;
    this.panelCtrl.refresh();
  }

  getTagValueOperator(tagValue, tagOperator) {
    if (tagOperator !== this.matchOperators.match &&
        tagOperator !== this.matchOperators.not &&
        /^\/.*\/$/.test(tagValue)) {
      return this.matchOperators.match;

    } else if ((tagOperator === this.matchOperators.match ||
                tagOperator === this.matchOperators.not) &&
               /^(?!\/.*\/$)/.test(tagValue)) {
      return '=';
    }
  }

  getCollapsedText() {
    return this.queryModel.render(false);
  }
}

