<template>
  <div class="deal-group">
    <div class="filter">
      <div class="filter-tags">
        <div class="filter-tag-row">
          <div v-for="filter in filters" :key="filter.name" :class="{ active: filter.active }" class="btn-tag" @click="selectFilter(filter)">
            <img v-if="filter.icon" :src="filter.icon" :alt="filter.name" class="ico-12">
            <span>{{ filter.name }}</span>
          </div>
        </div>
      </div>
      <compare-server v-if="compareFn" :fn="compareServer" :active-server="comparisonServer" />
    </div>
    <div class="deal-container">
      <div class="row labels">
        <div class="col-2 item">
          Item
        </div>
        <div class="col amount">
          Absolute Profit
        </div>
        <div class="col quantity">
          {{ crafting ? 'Profession' : 'Relative Profit' }}
        </div>
        <div class="col whitespace" />
      </div>
      <transition-group ref="deals" class="deal-list">
        <div v-for="(deal, i) in deals" :key="`${i}-${deal.itemId}`" class="deal">
          <router-link :to="!crafting ? `/wow-classic/items/${activeServer.slug}/${deal.uniqueName}` : `/wow-classic/items/${activeServer.slug}/${deal.uniqueName}/crafting`" class="row interactive">
            <img :src="deal.icon" class="deal-img-blur" :alt="deal.name">
            <div class="deal-title col-b-2">
              <div class="deal-img">
                <img :src="deal.icon" :class="{ mod: deal.icon.includes('jpeg') }" :alt="deal.name">
              </div>
              <span>{{ deal.name }}</span>
            </div>
            <div class="deal-data-value col-b">
              <img src="/img/warframe/ui/platinum.svg" alt="Gold" class="ico-12">
              <span>{{ parsePrice(!crafting ? deal.dealDiff : deal.profit) }}</span>
            </div>
            <div class="deal-data-value col-b price">
              <span v-if="!crafting" :class="{ negative: deal.dealPercentage < 0 }" class="price-diff">
                <indicator :diff="deal.dealPercentage" /> {{ +Math.abs(deal.dealPercentage * 100).toFixed(2) }}%
              </span>
              <span v-else class="category">{{ deal.category }}</span>
            </div>
            <div class="deal-data-value col-b whitespace">
              <span v-if="!crafting && !comparisonServer.slug" class="unavailable">Cheaper than Market Value</span>
              <span v-else-if="crafting" class="unavailable">Crafting Profit</span>
              <span v-else-if="!crafting && comparisonServer.slug" class="unavailable">Compared with {{ compareServerPretty }}</span>
            </div>
          </router-link>
        </div>
      </transition-group>
    </div>
    <div v-if="!reachedEndOfDeals" class="deal-status">
      <img src="/img/ui/status-loading-wow-classic.svg" class="ico-h-24" alt="loading">
      <p>Loading deals...</p>
    </div>
    <div v-else class="deal-status">
      <p>You've reached the end</p>
    </div>
  </div>
</template>

<script>
import compareServer from 'src/components/wow-classic/compare-server.vue'
import indicator from 'src/components/charts/indicator.vue'
import utility from 'src/components/wow-classic/utility.js'

export default {
  components: {
    indicator,
    compareServer
  },

  props: ['crafting', 'compareFn'],

  data () {
    return {
      fetchingDeals: false,
      comparisonServer: {
        slug: '',
        name: '',
        region: '',
        faction: ''
      }
    }
  },

  computed: {
    compareServerPretty () {
      if (!this.comparisonServer.slug) return null
      const factionPretty = this.comparisonServer.faction.charAt(0).toUpperCase() + this.comparisonServer.faction.slice(1)
      return `${this.comparisonServer.name} (${factionPretty})`
    },
    deals () {
      const deals = this.$store.state.deals.deals

      // Apply active filters
      const activeFilters = this.filters.filter(f => f.active && !f.unique)
      const filteredDeals = []
      for (const f of activeFilters) {
        const filtered = deals.filter(d => d.category === f.name)
        for (const deal of filtered) {
          const dealAlreadyExists = filteredDeals.find(d => d.itemId === deal.itemId)
          if (!dealAlreadyExists) filteredDeals.push(deal)
        }
      }

      if (activeFilters.length) {
        filteredDeals.sort((a, b) => b.profit - a.profit)
        if (filteredDeals.length < 15) this.$nextTick(this.updateOnScroll.bind(this, null, true))
      }
      return activeFilters.length ? filteredDeals : deals
    },
    filters () {
      return this.$store.state.deals.filters
    },
    reachedEndOfDeals () {
      return this.$store.state.deals.reachedEndOfDeals
    },
    fetchUrl () {
      return this.$store.state.deals.fetchUrl
    },
    activeServer () {
      return this.$store.state.servers.activeServer
    }
  },

  created () {
    this.parsePrice = utility.parsePrice
  },

  mounted () {
    window.addEventListener('scroll', this.updateOnScroll)
  },

  beforeDestroy () {
    window.removeEventListener('scroll', this.updateOnScroll)
  },

  methods: {
    async updateOnScroll (event, forceUpdate = false) {
      const lastDeal = this.$refs.deals.$children.length ? this.$refs.deals.$children[this.$refs.deals.$children.length - 1].$el : this.$refs.deals.$el
      const lastDealPosition = lastDeal.getBoundingClientRect().top + window.pageYOffset // Absolute position
      const viewportHeight = window.innerHeight

      // Scrolled to last element
      if ((forceUpdate || window.scrollY >= lastDealPosition - viewportHeight) && !this.fetchingDeals && !this.reachedEndOfDeals) {
        this.fetchingDeals = true
        await this.$store.dispatch('addDeals')
        while (this.deals.length < 15 && !this.reachedEndOfDeals) {
          await this.$store.dispatch('addDeals')
        }
        this.fetchingDeals = false
      }
    },
    async selectFilter (filter) {
      const newFilters = this.filters
      const selectedFilter = newFilters.find(f => f.name === filter.name)

      // Terminate if non-existent or unique already active
      if (!selectedFilter || (selectedFilter.unique && selectedFilter.active)) return

      // Disable other unique filters
      if (filter.unique) {
        for (const newFilter of newFilters) {
          if (newFilter.unique) newFilter.active = false
        }

        if (filter.fetchUrl && filter.fetchUrl !== this.fetchUrl) {
          this.$store.commit('setFetchUrl', filter.fetchUrl)
          const deals = await this.$cubic.get(filter.fetchUrl)
          for (const deal of deals) deal.icon = `https://render-classic-us.worldofwarcraft.com/icons/56/${deal.icon}.jpg`
          this.$store.commit('setDeals', deals)
        }
      }

      // Toggle filter
      selectedFilter.active = !selectedFilter.active
      this.$store.commit('setFilters', newFilters)
    },
    async compareServer (server) {
      this.compareFn(server)
      const serverSplit = server.split('-')
      const faction = serverSplit.pop()
      const serverObj = { ...this.$store.state.servers.serverlist.find(s => s.slug === serverSplit.join('-')) } // Avoid mutating
      serverObj.slug = server
      serverObj.faction = faction
      this.comparisonServer = serverObj
    }
  }
}
</script>

<style lang="scss" scoped>
@import '~src/styles/partials/wow-classic/importer';

.deal-container {
  margin-top: 20px;
  position: relative; // for position: absolute item list views
  overflow: hidden;
  @include ease-out(0.35s); // When results block gets resized
}
.unavailable {
  color: $color-font-body;
}
.deal {
  @include ease(0.5s);

  .deal-title {
    position: relative;
    display: flex;
    align-items: center;
  }
  .deal-img-blur {
    position: absolute;
    left:0;
    height: 400%;
    opacity: 0.4;
    z-index: 0;
    filter: blur(80px);
  }
  .deal-img {
    position: relative;
    display: flex;
    align-items: center;
    overflow: hidden;
    height: 38px;
    width: 38px;
    border-radius: 2px;
    margin-right: 20px;

    img {
      width: 100%;
    }
    img.mod {
      border-radius: 4px;
    }
  }
  .deal-data {
    position: relative;
    flex-wrap: wrap;
    align-items: center;
    width: 70%;
  }
  .deal-data-value {
    font-size: 0.9em;
    white-space: nowrap;

    span.negative {
      color: $color-error;
    }
    .price-diff {
      color: $color-positive;
    }
  }
  @media (max-width: $breakpoint-s) {
    .deal-title {
      span {
        position: relative;
        top: -10px;
      }
    }
    .deal-img {
      margin-right: 10px;
      height: 50px;
      width: 50px;
    }
    .deal-img-blur {
      left: -50%;
    }
    .deal-data-value {
      flex-grow: 1;
      flex-basis: 1%;
      position: relative;
      top: -23px;
      margin-bottom: -20px;
      margin-left: 60px;

      &.price {
        padding-top: 1px;
      }
    }
    .whitespace {
      display: none;
    }
  }
}
.category {
  color: $color-font-body;
}
.deal-status {
  color: $color-font-body;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 5px 0;
  width: 100%;
  @include uppercase;
  font-size: 0.9em;
  @include ease(0.35s);
  margin-top: 15px;

  img {
    margin-right: 3px;
  }

  @media (max-width: $breakpoint-s) {
    font-size: 0.8em;
  }
}

.filter {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-content: center;
  flex-wrap: wrap;
  border-top: 1px solid $color-subtle-dark;
  padding-top: 15px;

  .filter-tags {
    display: flex;
    align-items: center;
    margin-right: 150px; // break when view type is supposed to cause break

    @media (max-width: $breakpoint-s) {
      width: 100%;
    }
    .filter-tags-row {
      display: inline-block;
      margin-right: 20px;
      padding-right: 20px;
    }
  }
}

// Fix for btn-tags having no ascending tag
.btn-tag {
  img {
    margin-right: 2px !important;
  }
}

a {
  position: relative;
  overflow: hidden;
  @include field;
  align-items: center;
  border-radius: 2px;
  padding: 10px 20px;
  margin-bottom: 8px;
  @include ease(0.05s);

  &:hover {
    opacity: 1 !important;
    transform: scale(0.995);
  }
  &:active {
    transform: scale(0.995);
  }
  &:before {
    border-radius: 0;
  }
}

.labels {
  @include uppercase;
  color: $color-font-subtle;
  font-size: 0.8em;
  padding: 10px 20px;
  border-radius: 2px;
  background: $color-bg-darker;
  margin-bottom: 8px;

  .interactive {
    padding: 0;
    background: transparent;

    &:before {
      background: transparent;
    }
  }
  .whitespace {
    @media (max-width: $breakpoint-s) {
      display: none;
    }
  }

  @media (max-width: $breakpoint-s) {
    display: none;
  }
}

.select {
  font-size: 0.8em;
}
</style>
