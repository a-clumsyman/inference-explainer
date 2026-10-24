// Real sprite art (CC0), see assets/ATTRIBUTION.md. Picked by the user from the character-shopping sheet.
import waiterStand from './assets/waiter-stand.png'
import waiterTalk from './assets/waiter-talk.png'
import waiterCloseup from './assets/waiter-closeup.png'
import chef from './assets/chef.png'
import souschef from './assets/souschef.png'
import customer1 from './assets/customer1.png'
import customer2 from './assets/customer2.png'
import customer3 from './assets/customer3.png'
import customer4 from './assets/customer4.png'
import customer5 from './assets/customer5.png'
import customer6 from './assets/customer6.png'
import customer7 from './assets/customer7.png'
import customer8 from './assets/customer8.png'
import biscuit1 from './assets/biscuit-1.png'
import biscuit2 from './assets/biscuit-2.png'

export const WAITER = { stand: waiterStand, talk: waiterTalk, closeup: waiterCloseup }
export const CHEF_IMG = chef
export const SOUSCHEF_IMG = souschef
export const BISCUIT = [biscuit1, biscuit2]

/** The maker's own sprite for the welcome intro: the blue-polo character, closest to his blue-hoodie look. */
export const MAKER_IMG = customer3

const CUSTOMERS = [customer1, customer2, customer3, customer4, customer5, customer6, customer7, customer8]
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Deterministic customer look: the same customer id always gets the same sprite. */
export function customerSprite(id: string): string {
  return CUSTOMERS[hash(id) % CUSTOMERS.length]
}
