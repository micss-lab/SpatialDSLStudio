describe('EmailService', () => {
  describe('sendAdminBroadcastEmail', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      process.env = {
        ...originalEnv,
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        RESEND_API_KEY: 'test-resend-key',
        RESEND_FROM_EMAIL: 'noreply@micss-lab.be',
        APP_URL: 'https://dsl-studio.micss-lab.be',
        ADMIN_BROADCAST_EMAIL_BATCH_SIZE: '2',
        ADMIN_BROADCAST_EMAIL_BATCH_DELAY_MS: '0',
      };
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.dontMock('resend');
    });

    it('sends admin broadcasts in small sequential cc and bcc batches', async () => {
      let emailIndex = 0;
      const sendMock = jest.fn().mockImplementation(async () => ({
        data: { id: `email-${emailIndex += 1}` },
        error: null,
      }));

      jest.doMock('resend', () => ({
        Resend: jest.fn().mockImplementation(() => ({
          emails: {
            send: sendMock,
          },
        })),
      }));

      const { sendAdminBroadcastEmail } = require('../../services/email.service');

      const result = await sendAdminBroadcastEmail(
        'Platform update',
        'Please review the new workflow.',
        [
          'admin1@example.com',
          'admin2@example.com',
          'ADMIN1@example.com',
          'admin3@example.com',
        ],
        [
          'admin1@example.com',
          'user1@example.com',
          'user2@example.com',
          'user3@example.com',
          'USER3@example.com',
          'user4@example.com',
          'user5@example.com',
        ]
      );

      expect(sendMock).toHaveBeenCalledTimes(5);
      expect(sendMock.mock.calls.map(call => call[0])).toEqual([
        expect.objectContaining({
          from: 'noreply@micss-lab.be',
          to: 'noreply@micss-lab.be',
          cc: ['admin1@example.com', 'admin2@example.com'],
        }),
        expect.objectContaining({
          from: 'noreply@micss-lab.be',
          to: 'noreply@micss-lab.be',
          cc: ['admin3@example.com'],
        }),
        expect.objectContaining({
          from: 'noreply@micss-lab.be',
          to: 'noreply@micss-lab.be',
          bcc: ['user1@example.com', 'user2@example.com'],
        }),
        expect.objectContaining({
          from: 'noreply@micss-lab.be',
          to: 'noreply@micss-lab.be',
          bcc: ['user3@example.com', 'user4@example.com'],
        }),
        expect.objectContaining({
          from: 'noreply@micss-lab.be',
          to: 'noreply@micss-lab.be',
          bcc: ['user5@example.com'],
        }),
      ]);
      expect(result).toEqual({
        batches: 5,
        ccCount: 3,
        bccCount: 5,
        emailIds: ['email-1', 'email-2', 'email-3', 'email-4', 'email-5'],
      });
    });
  });
});
