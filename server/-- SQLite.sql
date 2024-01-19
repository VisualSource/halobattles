-- SQLite
-- UPDATE units SET faction = "COVENANT" WHERE id = "locust_covenant_00";
--UPDATE units SET faction = "BANISHED" WHERE id IS NOT "locust_covenant_00";
-- UPDATE units SET requires = json_array('b-foundry','t-tier-2') WHERE id = "locust_covenant_00";
--SELECT DISTINCT units.* FROM units, json_each(units.requires) WHERE json_each.value IN ("b-foundry","t-tier-2") AND faction = "COVENANT";
--SELECT * FROM units WHERE json_array_length(requires) = 0 AND faction = "BANISHED";

UPDATE units SET name = "Bloodfuel Locust" WHERE id = "locust_banished_01";