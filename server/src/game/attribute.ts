type AttributeArray = Tag[];

type Tag = `tag:${string}` | `method:${string}` | `event:${string}`;


/**
 * Attribute are 
 * tag:
 *  string i.e tag:Spy
 *  
 * 
 * method:  
 *  method:explosed:arg1:arg2
 * 
 * event:
 *  event:endGame:self
 *  event:onCreate:["player","units",self.unit_cap],
 *  event:onDealloc:["units",self.unit_cap]
 *  event:onDealloc:["leaders",self.leader_cap]
 * 
 * @param attribute 
 */

function runAttributeEvent(attributes: string, event: string, handler: <T>(props: T) => void) {
    const value = JSON.parse(attributes) as AttributeArray;

    const events = value.filter(value => value.startsWith(event));
    for (const event of events) {
        handler(JSON.parse(event.replace(event, "")))
    }
}