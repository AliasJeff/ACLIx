export interface ChatIntent {
  intent: 'chat';
  query: string;
}

export type RoutedIntent = ChatIntent;

export class IntentRouter {
  route(input: string): RoutedIntent {
    return {
      intent: 'chat',
      query: input,
    };
  }
}
