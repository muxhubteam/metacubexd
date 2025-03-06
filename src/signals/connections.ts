import { makePersisted } from '@solid-primitives/storage'
import { differenceWith, isNumber, unionWith } from 'lodash'
import { CONNECTIONS_TABLE_MAX_CLOSED_ROWS } from '~/constants'
import { Connection, ConnectionRawMessage } from '~/types'

export type WsMsg = {
  connections?: ConnectionRawMessage[]
  uploadTotal: number
  downloadTotal: number
} | null

// DIRECT is from clash
// direct and dns-out is from the example of sing-box official site
export const [quickFilterRegex, setQuickFilterRegex] = makePersisted(
  createSignal<string>('DIRECT|direct|dns-out'),
  {
    name: 'quickFilterRegex',
    storage: localStorage,
  },
)

// we make connections global, so we can keep track of connections when user in proxy page
// when user selects proxy and close some connections they can back and check connections
// they closed
export const [allConnections, setAllConnections] = createSignal<Connection[]>(
  [],
)

export const [latestConnectionMsg, setLatestConnectionMsg] =
  createSignal<WsMsg>(null)

export const useConnections = () => {
  const [closedConnections, setClosedConnections] = createSignal<Connection[]>(
    [],
  )
  const [activeConnections, setActiveConnections] = createSignal<Connection[]>(
    [],
  )
  const [paused, setPaused] = createSignal(false)
  let num = Math.floor((window.innerHeight - 142) / 34)
  const timer = setInterval(() => {
    const dom = document.querySelector(
      '#root > div:nth-child(1) > div > div > div.overflow-x-auto.rounded-md.bg-base-300.whitespace-nowrap',
    )

    if (dom) {
      dom.addEventListener('scroll', () => {
        const scrollTop = dom.scrollTop // 当前滚动高度
        const clientHeight = dom.clientHeight // 可视区域高度
        const scrollHeight = dom.scrollHeight // 总高度
        // console.log(scrollTop, clientHeight, scrollHeight)

        if (scrollTop + clientHeight >= scrollHeight - 10) {
          num = num + 10
        }
      })

      clearInterval(timer)
    }
  }, 100)

  createEffect(() => {
    const rawConns = latestConnectionMsg()?.connections

    if (!rawConns) {
      return
    }

    untrack(() => {
      let activeConns = restructRawMsgToConnection(
        rawConns,
        activeConnections(),
      )

      // console.log(JSON.stringify(activeConns))
      mergeAllConnections(activeConnections())

      let isSearch = localStorage.getItem('search')
      if (isSearch) {
        activeConns = activeConns.filter(
          (conn) =>
            Object.values(conn.metadata).some(
              (value) =>
                typeof value === 'string' && value.startsWith(isSearch),
            ) ||
            Object.values(conn).some(
              (value) =>
                typeof value === 'string' && value.startsWith(isSearch),
            ),
        )
      }
      if (!paused()) {
        const closedConns = diffClosedConnections(activeConns, allConnections())
        if (localStorage.getItem('connectionsTableSorting')) {
          let data = JSON.parse(
            localStorage.getItem('connectionsTableSorting') || '',
          )
          if (data.length > 0 && data[0].id) {
            let id = data[0].id
            let desc = data[0].desc

            activeConns.sort((a, b) => {
              switch (id) {
                case 'dl':
                  return desc
                    ? b.download - a.download
                    : a.download - b.download
                case 'ul':
                  return desc ? a.upload - b.upload : a.upload - b.upload
                case 'connectTime':
                  return desc
                    ? dayjs(a.start).valueOf() - dayjs(b.start).valueOf()
                    : dayjs(a.start).valueOf() - dayjs(b.start).valueOf()
              }
            })
          }
        }
        setActiveConnections(
          // activeConns,
          activeConns.slice(0, num),
        )
        setClosedConnections(
          closedConns.slice(-CONNECTIONS_TABLE_MAX_CLOSED_ROWS),
        )
      }

      setAllConnections((allConnections) =>
        allConnections.slice(
          -(activeConns.length + CONNECTIONS_TABLE_MAX_CLOSED_ROWS),
        ),
      )
    })
  })

  const speedGroupByName = createMemo(() => {
    const returnMap: Record<string, number> = {}

    activeConnections().forEach((c) => {
      c.chains.forEach((chain) => {
        if (!returnMap[chain]) {
          returnMap[chain] = 0
        }

        returnMap[chain] += c.downloadSpeed
      })
    })

    return returnMap
  })

  return {
    closedConnections,
    activeConnections,
    speedGroupByName,
    paused,
    setPaused,
  }
}

export const restructRawMsgToConnection = (
  connections: ConnectionRawMessage[],
  prevActiveConnections: Connection[],
): Connection[] => {
  const prevMap = new Map<string, Connection>()
  prevActiveConnections.forEach((prev) => prevMap.set(prev.id, prev))

  return connections.map((connection) => {
    const prevConn = prevMap.get(connection.id)

    if (
      !prevConn ||
      !isNumber(prevConn.download) ||
      !isNumber(prevConn.upload)
    ) {
      return { ...connection, downloadSpeed: 0, uploadSpeed: 0 }
    }

    return {
      ...connection,
      downloadSpeed: connection.download - prevConn.download,
      uploadSpeed: connection.upload - prevConn.upload,
    }
  })
}

export const mergeAllConnections = (activeConns: Connection[]) => {
  setAllConnections((allConnections) =>
    unionWith(allConnections, activeConns, (a, b) => a.id === b.id),
  )
}

const diffClosedConnections = (
  activeConns: Connection[],
  allConns: Connection[],
) => differenceWith(allConns, activeConns, (a, b) => a.id === b.id)
