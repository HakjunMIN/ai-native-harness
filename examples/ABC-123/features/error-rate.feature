@ABC-123
Feature: Service error-rate highlighting
  Operators distinguish unhealthy services without relying on color alone.

  @AC-1
  Scenario: Error rate reaches the configured threshold
    Given the selected service has 5 errors among 100 server spans
    When the operator views the service map with a 5 percent threshold
    Then the service is marked as above threshold
    And the service has an accessible text status

  @AC-2
  Scenario: No observations exist in the selected time range
    Given the selected service has no server spans in the time range
    When the operator views the service map
    Then the service is marked as having no data
    And the service is not marked as healthy

  @AC-3
  Scenario: Query service times out
    Given the service query times out
    When the operator views the service map
    Then a recoverable error is displayed
    And the operator can retry the query
