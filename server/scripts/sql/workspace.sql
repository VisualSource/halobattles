-- SQLite
-- UPDATE units SET faction = "COVENANT" WHERE id = "locust_covenant_00";
--UPDATE units SET faction = "BANISHED" WHERE id IS NOT "locust_covenant_00";
-- UPDATE units SET requires = json_array('b-foundry','t-tier-2') WHERE id = "locust_covenant_00";
--SELECT DISTINCT units.* FROM units, json_each(units.requires) WHERE json_each.value IN ("b-foundry","t-tier-2") AND faction = "COVENANT";
--SELECT * FROM units WHERE json_array_length(requires) = 0 AND faction = "BANISHED";
--UPDATE units SET name = "Bloodfuel Locust" WHERE id = "locust_banished_01";


SELECT units.id,json_each(units.attributes) FROM units WHERE json_each.value = "Spy" AND faction = "BANISHED";
SELECT stat,id,health,shield,armor,damage,unit_type,attributes,weapon_type,damage_type FROM units WHERE id IN ();
--DROP TABLE buildings;
--DROP TABLE units;
--SELECT * FROM units;
SELECT * FROM buildings;

SELECT stat,id,health,shield,armor,damage,unit_type,attributes,weapon_type FROM units WHERE id IN ("locust_covenant_00");
SELECT armor,attributes,damage,health,id,shield,stat,weapon_type FROM units WHERE id IN ();