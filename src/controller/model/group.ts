import {KeyValue} from '../tstype';
import Entity from './entity';
import ZclTransactionSequenceNumber from '../helpers/zclTransactionSequenceNumber';
import * as Zcl from '../../zcl';
import Endpoint from './endpoint';

class Group extends Entity {
    private databaseID: number;
    private groupID: number;
    private members: Endpoint[]; // TODO: not implemented yet

    // Can be used by applications to store data.
    private meta: KeyValue;

    // This lookup contains all groups that are queried from the database, this is to ensure that always
    // the same instance is returned.
    private static lookup: {[groupID: number]: Group} = {};

    private constructor(databaseID: number, groupID: number, members: Endpoint[], meta: KeyValue) {
        super();
        this.databaseID = databaseID;
        this.groupID = groupID;
        this.members = members;
        this.meta = meta;
    }

    public isType(type: string): boolean {
        return type === 'group';
    }

    public get(key: 'groupID'): number {
        return this[key];
    }

    /**
     * CRUD
     */

    private static fromDatabaseRecord(record: KeyValue): Group {
        return new Group(record.id, record.groupID, record.members, record.meta);
    }

    private toDatabaseRecord(): KeyValue {
        return {id: this.databaseID, type: 'Group', groupID: this.groupID, members: this.members, meta: this.meta};
    }

    public static async findSingle(query: {groupID: number}): Promise<Group> {
        // Performance optimization: get from lookup if posible;
        const groupGroupID = this.lookup[query.groupID];
        if (query.hasOwnProperty('groupID') && groupGroupID) {
            return groupGroupID;
        }

        const results = await this.find(query);
        return results.length !== 0 ? results[0] : null;
    }

    public static async find(query: {groupID?: number}): Promise<Group[]> {
        const results = await this.database.find({...query, type: 'Group'});
        return results.map((r): Group => {
            const group = this.fromDatabaseRecord(r);
            if (!this.lookup[group.groupID]) {
                this.lookup[group.groupID] = group;
            }

            return this.lookup[group.groupID];
        });
    }

    public static async create(groupID: number): Promise<Group> {
        if (await this.findSingle({groupID})) {
            throw new Error(`Group with groupID '${groupID}' already exists`);
        }

        const databaseID = await this.database.newID();
        const group = new Group(databaseID, groupID, [], {});
        await this.database.insert(group.toDatabaseRecord());

        this.lookup[group.groupID] = group;
        return this.lookup[group.groupID];
    }

    public async removeFromDatabase(): Promise<void> {
        await Group.database.remove(this.databaseID);
        delete Group.lookup[this.groupID];
    }

    /**
     * Zigbee functions
     */
    public async command(clusterKey: number | string, commandKey: number | string, payload: KeyValue): Promise<void> {
        const cluster = Zcl.Utils.getCluster(clusterKey);
        const command = cluster.getCommand(commandKey);

        for (const parameter of command.parameters) {
            if (!payload.hasOwnProperty(parameter.name)) {
                throw new Error(`Parameter '${parameter.name}' is missing`);
            }
        }

        const frame = Zcl.ZclFrame.create(
            Zcl.FrameType.SPECIFIC, Zcl.Direction.CLIENT_TO_SERVER, true, null, ZclTransactionSequenceNumber.next(),
            command.ID, cluster.ID, payload
        );
        await Group.adapter.sendZclFrameGroup(this.groupID, frame);
    }
}

export default Group;