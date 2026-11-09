;(function () {
  'use strict'

  // These small components cover only the fields and tables used by this demo.
  // Keep the official components when they load successfully.
  if (!window.Vue || !window.ElementPlus) return

  const { ref, computed } = window.Vue

  if (!window.LayoutForm) {
    const LayoutForm = {
      name: 'DemoLayoutFormFallback',
      props: {
        modelValue: { type: Object, required: true },
        formList: { type: Array, default: () => [] },
        labelWidth: { type: String, default: '110px' },
      },
      emits: ['update:modelValue', 'change-val'],
      setup(props, { emit, expose }) {
        const formEl = ref(null)
        const groups = computed(() => props.formList || [])
        const isDisabled = item => Boolean(item.disabled || item.disabledFunc?.(props.modelValue))
        const update = (item, value) => {
          emit('update:modelValue', { ...props.modelValue, [item.prop]: value })
          emit('change-val', value, item)
        }
        const submit = async () => {
          if (!formEl.value) return false
          return formEl.value.validate().then(() => true, () => false)
        }
        const clearValidate = () => formEl.value?.clearValidate()
        expose({ submit, clearValidate })
        return { formEl, groups, isDisabled, update }
      },
      template: `
        <el-form ref="formEl" class="lpu-layout-form" :model="modelValue" :label-width="labelWidth">
          <el-row v-for="(group, groupIndex) in groups" :key="groupIndex" :gutter="14">
            <el-col v-for="item in group.cols || []" :key="item.prop" :span="item.col || 24">
              <el-form-item :label="item.label" :prop="item.prop" :rules="item.rules || []">
                <slot v-if="item.type === 'slot'" :name="item.prop" :data="modelValue" :item="item"></slot>
                <el-input v-else-if="item.type === 'el-input'"
                  :model-value="modelValue[item.prop]" :placeholder="item.placeholder"
                  :clearable="item.clearable" :maxlength="item.maxlength"
                  :disabled="isDisabled(item)" :style="{ width: item.width || '100%' }"
                  @update:model-value="update(item, $event)"></el-input>
                <el-select v-else-if="item.type === 'el-select'"
                  :model-value="modelValue[item.prop]" :placeholder="item.placeholder"
                  :clearable="item.clearable" :filterable="item.filterable"
                  :multiple="item.multiple" :disabled="isDisabled(item)"
                  :style="{ width: item.width || '100%' }"
                  @update:model-value="update(item, $event)">
                  <el-option v-for="option in item.options || []" :key="option.value"
                    :label="option.label" :value="option.value"></el-option>
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      `,
    }
    window.LayoutForm = { LayoutForm }
  }

  if (!window.SearchForm) {
    const SearchForm = {
      name: 'DemoSearchFormFallback',
      props: {
        searchParam: { type: Object, required: true },
        searchList: { type: Array, default: () => [] },
        isBtnSeparate: Boolean,
        showAll: Boolean,
      },
      emits: ['update:searchParam', 'change-val', 'search', 'reset'],
      setup(props, { emit }) {
        const visibleItems = computed(() => (props.searchList || []).filter(item => {
          return typeof item.isShowFunc !== 'function' || item.isShowFunc(props.searchParam)
        }))
        const update = (item, value) => {
          emit('update:searchParam', { ...props.searchParam, [item.prop]: value })
          emit('change-val', value, item)
        }
        return { visibleItems, update }
      },
      template: `
        <div class="lpu-search-form-container fallback-search-form"
          :class="{ 'is-btn-separate': isBtnSeparate }">
          <div class="lpu-search-form-content">
            <div v-for="item in visibleItems" :key="item.prop" class="fallback-search-field">
              <label class="lpu-search-form-label" :for="'fallback-search-' + item.prop">{{ item.label }}</label>
              <el-form-item>
                <el-input v-if="item.type === 'el-input'" :id="'fallback-search-' + item.prop"
                  :model-value="searchParam[item.prop]" :placeholder="item.placeholder"
                  :clearable="item.clearable" :style="{ width: item.width || '180px' }"
                  @update:model-value="update(item, $event)"
                  @keyup.enter="$emit('search')"></el-input>
                <el-select v-else-if="item.type === 'el-select'" :id="'fallback-search-' + item.prop"
                  :model-value="searchParam[item.prop]" :placeholder="item.placeholder"
                  :clearable="item.clearable" :filterable="item.filterable"
                  :multiple="item.multiple" :style="{ width: item.width || '180px' }"
                  @update:model-value="update(item, $event)">
                  <el-option v-for="option in item.options || []" :key="option.value"
                    :label="option.label" :value="option.value"></el-option>
                </el-select>
                <el-date-picker v-else-if="item.type === 'el-date-picker'"
                  :id="'fallback-search-' + item.prop" :model-value="searchParam[item.prop]"
                  :type="item.dataType || 'date'" :value-format="item.valueFormat"
                  :clearable="item.clearable" :style="{ width: item.width || '220px' }"
                  range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
                  @update:model-value="update(item, $event)"></el-date-picker>
              </el-form-item>
            </div>
          </div>
          <div class="lpu-search-form-btn-container">
            <el-button type="primary" @click="$emit('search')">查询</el-button>
            <el-button @click="$emit('reset')">重置</el-button>
          </div>
        </div>
      `,
    }
    window.SearchForm = { SearchForm }
  }

  if (!window.ListTable) {
    const ListTable = {
      name: 'DemoListTableFallback',
      props: {
        tableData: { type: Array, default: () => [] },
        tableList: { type: Array, default: () => [] },
        tableOption: { type: Object, default: () => ({}) },
        pageOption: { type: Object, default: () => ({}) },
        loading: Boolean,
      },
      emits: ['handle-current-change', 'handle-size-change'],
      template: `
        <div class="lpu-list-table fallback-list-table" :class="{ 'is-loading': loading }">
          <el-table :data="tableData" :max-height="tableOption.maxHeight" empty-text="暂无数据"
            table-layout="auto" style="width:100%">
            <el-table-column v-for="column in tableList" :key="column.prop"
              :prop="column.prop" :label="column.label" :min-width="column.minWidth"
              :align="column.align || 'left'">
              <template #default="scope">
                <slot :name="column.prop" :row="scope.row" :index="scope.$index">{{ scope.row[column.prop] }}</slot>
              </template>
            </el-table-column>
            <el-table-column v-if="$slots.operate" label="操作"
              :width="tableOption.operateWidth || 100" :fixed="tableOption.operateFixed">
              <template #default="scope"><slot name="operate" :row="scope.row" :index="scope.$index"></slot></template>
            </el-table-column>
          </el-table>
          <el-pagination v-if="tableOption.hasPagination" background
            :current-page="pageOption.pageNum || 1" :page-size="pageOption.pageSize || 10"
            :total="pageOption.total || 0" :page-sizes="[5, 10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="$emit('handle-current-change', $event)"
            @size-change="$emit('handle-size-change', $event)"></el-pagination>
        </div>
      `,
    }
    window.ListTable = { ListTable }
  }

  if (window.LayoutForm.LayoutForm?.name === 'DemoLayoutFormFallback' ||
      window.SearchForm.SearchForm?.name === 'DemoSearchFormFallback' ||
      window.ListTable.ListTable?.name === 'DemoListTableFallback') {
    console.info('[渠道追踪 Demo] 已启用页面组件兜底')
  }
})()
